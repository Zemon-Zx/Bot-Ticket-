const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionsBitField,
    REST,
    Routes
} = require('discord.js');
const express = require('express');
const path = require('path');
require('dotenv').config();

// สร้างแอปเว็บเซิร์ฟเวอร์
const app = express();
const PORT = process.env.PORT || 3000;

// สร้างหน่วยความจำแบบ Map เพื่อเก็บ ID บอท และ เวลาที่ซีม่อนแอดเข้ามา
let trackedBots = new Map();

// สร้าง Map สำหรับเก็บข้อมูลคนเข้าร่วม Giveaway (เพื่อเช็คว่าเคยกดหรือยัง)
let giveawayData = new Map();

// สร้างบอทและกำหนดสิทธิ์การเข้าถึงข้อมูล
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers
    ]
});

// ดึงค่าตัวแปรจาก Railway Variables
const TOKEN = process.env.DISCORD_TOKEN;
const SIMON_ID = process.env.SIMON_ID;

// ==========================================
// ส่วนที่ 1: ระบบ Web Server (แสดงหน้าเว็บ)
// ==========================================
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/status', async (req, res) => {
    const botsData = [];
    botsData.push({
        id: client.user.id,
        name: 'BOT TICKET & EVENT', 
        isMain: true,
        isOnline: client.isReady(),
        ping: client.ws.ping,
        uptime: client.uptime
    });

    const guild = client.guilds.cache.first();
    if (guild) {
        for (const [botId, startTime] of trackedBots.entries()) {
            try {
                const member = await guild.members.fetch(botId).catch(() => null);
                if (member) {
                    const isOnline = member.presence && member.presence.status !== 'offline';
                    const fakePing = client.ws.ping > 0 ? client.ws.ping + Math.floor(Math.random() * 12) : 45 + Math.floor(Math.random() * 20);
                    botsData.push({
                        id: member.user.id,
                        name: member.user.username,
                        isMain: false,
                        isOnline: isOnline,
                        ping: isOnline ? fakePing : 0,
                        uptime: isOnline ? (Date.now() - startTime) : 0
                    });
                }
            } catch (error) {
                console.log('หาบอทไม่เจอค่ะ:', error);
            }
        }
    }
    res.json(botsData);
});

app.listen(PORT, () => {
    console.log(`🌐 ปายเปิดหน้าเว็บให้ซีม่อนแล้วนะคะ (Port: ${PORT})`);
});

// ==========================================
// ส่วนที่ 2: ฟังก์ชันสำหรับ Giveaway
// ==========================================
// แปลงข้อความเวลา (เช่น 1m, 1h, 1d) เป็นมิลลิวินาที
function parseTime(timeStr) {
    const unit = timeStr.slice(-1);
    const value = parseInt(timeStr.slice(0, -1));
    if (isNaN(value)) return null;

    if (unit === 's') return value * 1000; // วินาที
    if (unit === 'm') return value * 60000; // นาที
    if (unit === 'h') return value * 3600000; // ชั่วโมง
    if (unit === 'd') return value * 86400000; // วัน
    return null;
}

// สร้างหลอดความคืบหน้า (Progress Bar)
function createProgressBar(percent) {
    const totalBars = 15;
    const filledBars = Math.round((percent / 100) * totalBars);
    const emptyBars = totalBars - filledBars;
    return '⚪'.repeat(filledBars) + '⚫'.repeat(emptyBars);
}

// ==========================================
// ส่วนที่ 3: ระบบ Discord Bot
// ==========================================
client.on('ready', async () => {
    console.log(`💖 ปายพร้อมให้บริการแล้วค่ะ! ล็อกอินในชื่อ ${client.user.tag}`);

    const commands = [
        {
            name: 'setup-ticket',
            description: 'สร้างหน้าต่าง Panel สำหรับเปิด Ticket (เฉพาะซีม่อนใช้ได้ค่ะ)',
        },
        {
            name: 'addbot-status',
            description: 'เพิ่มบอทลงในหน้าเว็บสถานะ (เฉพาะซีม่อนใช้ได้ค่ะ)',
            options: [{ name: 'bot', description: 'เลือกบอทที่ต้องการให้ไปโชว์ในหน้าเว็บ', type: 6, required: true }]
        },
        {
            name: 'giveaway',
            description: 'สร้างกิจกรรมสุ่มแจกรางวัลสุดพิเศษ (เฉพาะซีม่อนใช้ได้ค่ะ)',
            options: [
                { name: 'prize', description: 'ใส่ชื่อของรางวัลที่จะแจก', type: 3, required: true },
                { name: 'duration', description: 'ระยะเวลา (ตัวอย่าง: 10s, 5m, 1h, 2d)', type: 3, required: true },
                { name: 'winners', description: 'จำนวนผู้ชนะ (1-5 คน)', type: 4, required: true }
            ]
        }
    ];

    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✨ ปายสร้างคำสั่งทั้งหมดให้ซีม่อนเรียบร้อยแล้วค่ะ!');
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการสร้างคำสั่งค่ะซีม่อน:', error);
    }
});

client.on('interactionCreate', async interaction => {
    // -----------------------------------------------------
    // Slash Commands
    // -----------------------------------------------------
    if (interaction.isChatInputCommand()) {
        
        // --- คำสั่งสร้าง Ticket ---
        if (interaction.commandName === 'setup-ticket') {
            if (interaction.user.id !== SIMON_ID) return interaction.reply({ content: 'คำสั่งนี้เฉพาะซีม่อนใช้ได้นะคะ! 🥺', ephemeral: true });
            
            const embed = new EmbedBuilder()
                .setTitle('🎫 ศูนย์ช่วยเหลือ / ติดต่อสอบถาม')
                .setDescription('หากมีข้อสงสัย แจ้งปัญหา หรือต้องการติดต่อทีมงาน\nสามารถกดปุ่ม **"เปิด Ticket"** ด้านล่างได้เลยนะคะ เดี๋ยวระบบจะสร้างห้องส่วนตัวให้ค่ะ ✨')
                .setColor('#FFB6C1')
                .setFooter({ text: 'เจ้าของ ซีม่อน ผู้ร่วมพัฒนา ปาย' });

            const button = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_ticket').setLabel('เปิด Ticket').setEmoji('📩').setStyle(ButtonStyle.Success)
            );

            await interaction.reply({ content: 'ปายสร้าง Panel ให้ซีม่อนเรียบร้อยแล้วค่ะ! 🥰', ephemeral: true });
            await interaction.channel.send({ embeds: [embed], components: [button] });
        }

        // --- คำสั่งเพิ่มบอท ---
        if (interaction.commandName === 'addbot-status') {
            if (interaction.user.id !== SIMON_ID) return interaction.reply({ content: 'คำสั่งนี้เฉพาะซีม่อนใช้ได้นะคะ! 🥺', ephemeral: true });
            const targetBot = interaction.options.getUser('bot');
            if (!targetBot.bot) return interaction.reply({ content: 'ต้องเลือกบอทเท่านั้นนะคะ! ❌', ephemeral: true });
            if (!trackedBots.has(targetBot.id)) trackedBots.set(targetBot.id, Date.now());
            await interaction.reply({ content: `✅ ปายเพิ่มบอท **${targetBot.username}** ลงเว็บสถานะแล้วค่ะ! 💖`, ephemeral: true });
        }

        // --- คำสั่ง Giveaway ---
        if (interaction.commandName === 'giveaway') {
            if (interaction.user.id !== SIMON_ID) return interaction.reply({ content: 'คำสั่งนี้เฉพาะซีม่อนตั้งกิจกรรมได้คนเดียวค่ะ! 🥺', ephemeral: true });

            const prize = interaction.options.getString('prize');
            const durationStr = interaction.options.getString('duration');
            const winnerCount = interaction.options.getInteger('winners');
            
            const durationMs = parseTime(durationStr);
            if (!durationMs) return interaction.reply({ content: 'รูปแบบเวลาไม่ถูกต้องค่ะซีม่อน (ตัวอย่างที่ถูก: 10s, 5m, 1h, 1d) ❌', ephemeral: true });
            if (winnerCount < 1 || winnerCount > 5) return interaction.reply({ content: 'กำหนดผู้ชนะได้ 1 - 5 คนเท่านั้นนะคะ! ❌', ephemeral: true });

            const endTime = Date.now() + durationMs;
            const discordTimestamp = Math.floor(endTime / 1000); // สำหรับแท็ก <t:...:R> ของดิสคอร์ด

            // สร้างข้อความ Embed สำหรับกิจกรรม
            const embed = new EmbedBuilder()
                .setTitle('🎉 ZEMON ŹX : GIVEAWAY EVENT 🎉')
                .setDescription(`----------------------------------------\n💎 **ของรางวัล:** ${prize}\n👑 **ผู้จัดกิจกรรม:** <@${SIMON_ID}>\n🏆 **จำนวนผู้โชคดี:** ${winnerCount} ท่าน\n----------------------------------------\n\n⏳ **เวลาที่เหลือ:**\n${createProgressBar(0)} 0%\nสิ้นสุดใน: <t:${discordTimestamp}:R>\n\n👇 **กด 🎁 ด้านล่างเพื่อเข้าร่วมกิจกรรม!**`)
                .setColor('#FF0000')
                .setThumbnail('https://placehold.co/400x300/ff0000/ffffff?text=GIVEAWAY') // รูปของแจก
                .setFooter({ text: 'Zemon Źx Bot • ผู้มอบความสุขให้คุณ 💖' });

            const button = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('join_giveaway').setLabel('เข้าร่วมกิจกรรม').setEmoji('🎁').setStyle(ButtonStyle.Success)
            );

            await interaction.reply({ content: 'ปายสร้างกิจกรรมให้ซีม่อนเรียบร้อยแล้วค่ะ! 🎀', ephemeral: true });
            const giveawayMsg = await interaction.channel.send({ embeds: [embed], components: [button] });

            // เตรียมข้อมูลเก็บไว้เช็ค
            giveawayData.set(giveawayMsg.id, { participants: [], prize, winnerCount, host: SIMON_ID });

            // สร้างลูปเพื่ออัปเดตหลอดความคืบหน้า (Progress Bar) ทุกๆ 1/10 ของเวลา (หรืออย่างน้อยทุก 5 วิ)
            const updateIntervalTime = Math.max(durationMs / 10, 5000); 
            const startTime = Date.now();
            
            const updateInterval = setInterval(async () => {
                const now = Date.now();
                const passedTime = now - startTime;
                let percent = Math.floor((passedTime / durationMs) * 100);
                if (percent > 100) percent = 100;

                const updatedEmbed = EmbedBuilder.from(embed).setDescription(`----------------------------------------\n💎 **ของรางวัล:** ${prize}\n👑 **ผู้จัดกิจกรรม:** <@${SIMON_ID}>\n🏆 **จำนวนผู้โชคดี:** ${winnerCount} ท่าน\n----------------------------------------\n\n⏳ **เวลาที่เหลือ:**\n${createProgressBar(percent)} ${percent}%\nสิ้นสุดใน: <t:${discordTimestamp}:R>\n\n👇 **กด 🎁 ด้านล่างเพื่อเข้าร่วมกิจกรรม!**`);
                
                // เช็คว่าข้อความยังอยู่ไหมก่อนแก้อัปเดต
                try {
                    await giveawayMsg.edit({ embeds: [updatedEmbed] });
                } catch (e) {
                    clearInterval(updateInterval);
                }
            }, updateIntervalTime);

            // เมื่อหมดเวลา
            setTimeout(async () => {
                clearInterval(updateInterval); // หยุดลูปอัปเดตหลอด
                const data = giveawayData.get(giveawayMsg.id);
                if (!data) return;

                const participants = data.participants;
                let resultMessage = '';
                
                // ปิดปุ่มกิจกรรม
                const disabledButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('join_giveaway').setLabel('กิจกรรมสิ้นสุดแล้ว').setEmoji('🔒').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );

                const finalEmbed = EmbedBuilder.from(embed)
                    .setTitle('🔒 กิจกรรมสิ้นสุดแล้ว! 🔒')
                    .setDescription(`----------------------------------------\n💎 **ของรางวัล:** ${prize}\n👑 **ผู้จัดกิจกรรม:** <@${SIMON_ID}>\n🏆 **จำนวนผู้โชคดี:** ${winnerCount} ท่าน\n----------------------------------------\n\n⏳ **สถานะ:** กิจกรรมจบลงแล้ว!\n${createProgressBar(100)} 100%`)
                    .setColor('#36393F');
                
                await giveawayMsg.edit({ embeds: [finalEmbed], components: [disabledButton] });

                // สุ่มผู้ชนะ
                if (participants.length === 0) {
                    resultMessage = `อ่าว... ไม่มีใครเข้าร่วมกิจกรรมนี้เลยค่ะ 😢 ขอยกเลิกการแจกรางวัลนะคะ!`;
                    await interaction.channel.send({ content: resultMessage });
                } else {
                    const actualWinnersCount = Math.min(winnerCount, participants.length);
                    const winners = [];
                    // สุ่มคนแบบไม่ซ้ำ
                    for (let i = 0; i < actualWinnersCount; i++) {
                        const randomIndex = Math.floor(Math.random() * participants.length);
                        winners.push(participants[randomIndex]);
                        participants.splice(randomIndex, 1); 
                    }

                    const winnersMentions = winners.map(id => `<@${id}>`).join(', ');
                    
                    // สร้าง Embed ประกาศผลผู้ชนะ
                    const winEmbed = new EmbedBuilder()
                        .setTitle('🎊 ยินดีด้วยกับผู้โชคดี! 🎊')
                        .setDescription(`----------------------------------------\n🎁 **รางวัล:** ${prize}\n👤 **ผู้โชคดี:** ${winnersMentions}\n----------------------------------------\n\n📌 **วิธีรับรางวัล:**\nกรุณาติดต่อแอดมินหรือเปิด Ticket ที่ห้อง [คลิกเพื่อติดต่อรับรางวัล](https://discord.gg/AYby9ypmyy) เพื่อยืนยันตัวตนนะคะ 💖`)
                        .setColor('#FFD700')
                        .setImage('https://placehold.co/600x200/ffafbd/ffffff?text=WINNER')
                        .setFooter({ text: 'Zemon Źx Bot • ระบบสุ่มผู้โชคดีคุณภาพ' });

                    const announceMsg = await interaction.channel.send({ content: `🎉 ยินดีด้วยครับ! ${winnersMentions} คุณได้รับ **${prize}** !`, embeds: [winEmbed] });

                    // ตั้งเวลาลบข้อความกิจกรรม และ ข้อความประกาศผล ในอีก 10 ชั่วโมง (36,000,000 ms)
                    setTimeout(() => {
                        giveawayMsg.delete().catch(console.error);
                        announceMsg.delete().catch(console.error);
                        giveawayData.delete(giveawayMsg.id); // ล้างหน่วยความจำ
                    }, 36000000); 
                }
            }, durationMs);
        }
    }

    // -----------------------------------------------------
    // Button Interactions
    // -----------------------------------------------------
    if (interaction.isButton()) {
        
        // --- ปุ่มเข้าร่วมกิจกรรม ---
        if (interaction.customId === 'join_giveaway') {
            const msgId = interaction.message.id;
            const userId = interaction.user.id;
            const data = giveawayData.get(msgId);

            if (!data) return interaction.reply({ content: 'กิจกรรมนี้จบไปแล้วหรือหาไม่เจอค่ะ 😢', ephemeral: true });

            if (data.participants.includes(userId)) {
                return interaction.reply({ content: 'คุณเข้าร่วมกิจกรรมนี้ไปแล้วน้า รอประกาศผลได้เลยค่ะ! 💖', ephemeral: true });
            }

            // เพิ่มชื่อลงในรายการเข้าร่วม
            data.participants.push(userId);
            await interaction.reply({ content: '🎉 คุณเข้าร่วมกิจกรรมเรียบร้อยแล้วค่ะ ขอให้โชคดีนะคะ! ✨', ephemeral: true });
        }

        // --- ส่วนของการเปิดทิกเก็ต ---
        if (interaction.customId === 'open_ticket') {
            const guild = interaction.guild;
            const user = interaction.user;
            try {
                const ticketChannel = await guild.channels.create({
                    name: `ticket-${user.username}`,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                        { id: SIMON_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                        { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
                    ],
                });
                const ticketEmbed = new EmbedBuilder().setTitle(`ยินดีต้อนรับสู่ห้อง Ticket ค่ะคุณ ${user.username} 🎀`).setDescription('กรุณาพิมพ์รายละเอียดทิ้งไว้สักครู่นะคะ เดี๋ยวซีม่อนจะเข้ามาดูแลค่ะ\n\n*(ปุ่มปิดห้องสงวนสิทธิ์ให้ซีม่อนกดได้คนเดียวนะคะ)*').setColor('#ADD8E6');
                const closeButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('ปิดและลบ Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger));
                await ticketChannel.send({ content: `<@${user.id}> | <@${SIMON_ID}> มี Ticket ใหม่เข้ามาค่ะ!`, embeds: [ticketEmbed], components: [closeButton] });
                await interaction.reply({ content: `ปายสร้างห้อง Ticket ให้เรียบร้อยแล้วค่ะ แวะไปที่ ${ticketChannel} ได้เลยน้า 💖`, ephemeral: true });
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'เกิดข้อผิดพลาดในการสร้างห้องค่ะ แจ้งซีม่อนให้ตรวจสอบให้ปายหน่อยนะคะ 😢', ephemeral: true });
            }
        }

        // --- ส่วนของการปิดทิกเก็ต ---
        if (interaction.customId === 'close_ticket') {
            if (interaction.user.id !== SIMON_ID) return interaction.reply({ content: 'ปุ่มนี้ซีม่อนของปายกดได้คนเดียวนะคะ! 🥺', ephemeral: true });
            await interaction.reply('กำลังปิดและลบห้อง Ticket ตามคำสั่งซีม่อนค่ะ... บ๊ายบายย 👋');
            setTimeout(() => { interaction.channel.delete().catch(console.error); }, 3000);
        }
    }
});

client.login(TOKEN);
