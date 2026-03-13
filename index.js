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

// หน่วยความจำเก็บข้อมูล
let trackedBots = new Map();
let giveawayData = new Map();

// สร้างบอทและกำหนดสิทธิ์
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers
    ]
});

// ดึงค่าจาก ENV
const TOKEN = process.env.DISCORD_TOKEN;
const SIMON_ID = process.env.SIMON_ID;

// ==========================================
// ส่วนที่ 1: ระบบ Web Server
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
                console.log('Error fetching bot status:', error);
            }
        }
    }
    res.json(botsData);
});

app.listen(PORT, () => {
    console.log(`🌐 ปายเปิดหน้าเว็บให้ซีม่อนแล้วที่ Port: ${PORT}`);
});

// ==========================================
// ส่วนที่ 2: ฟังก์ชันระบบ Giveaway (ตัวเต็ม)
// ==========================================
function parseTime(timeStr) {
    const unit = timeStr.slice(-1);
    const value = parseInt(timeStr.slice(0, -1));
    if (isNaN(value)) return null;

    if (unit === 's') return value * 1000;
    if (unit === 'm') return value * 60000;
    if (unit === 'h') return value * 3600000;
    if (unit === 'd') return value * 86400000;
    return null;
}

function createProgressBar(percent) {
    const totalBars = 15;
    let filledBars = Math.round((percent / 100) * totalBars);
    if (filledBars < 0) filledBars = 0;
    if (filledBars > totalBars) filledBars = totalBars;
    const emptyBars = totalBars - filledBars;
    return '⚪'.repeat(filledBars) + '⚫'.repeat(emptyBars);
}

async function startGiveawayTimer(msgId, channel) {
    const data = giveawayData.get(msgId);
    if (!data || data.hasStarted) return;

    data.hasStarted = true;
    const startTime = Date.now();
    const endTime = startTime + data.durationMs;
    const discordTimestamp = Math.floor(endTime / 1000);

    const updateIntervalTime = Math.max(data.durationMs / 10, 5000); 
    
    try {
        const msg = await channel.messages.fetch(msgId);
        const activeEmbed = EmbedBuilder.from(msg.embeds[0])
            .setDescription(`----------------------------------------\n💎 **ของรางวัล:** ${data.prize}\n👑 **ผู้จัดกิจกรรม:** <@${data.host}>\n🏆 **จำนวนผู้โชคดี:** ${data.winnerCount} ท่าน\n----------------------------------------\n\n⏳ **เวลาที่เหลือ:**\n${createProgressBar(0)} 0%\nสิ้นสุดใน: <t:${discordTimestamp}:R>\n\n👇 **กด 🎁 ด้านล่างเพื่อเข้าร่วมกิจกรรม!**`);
        await msg.edit({ embeds: [activeEmbed] });
    } catch (e) { console.error(e); }

    data.interval = setInterval(async () => {
        const now = Date.now();
        const passedTime = now - startTime;
        let percent = Math.floor((passedTime / data.durationMs) * 100);
        if (percent > 100) percent = 100;

        try {
            const msg = await channel.messages.fetch(msgId);
            const updatedEmbed = EmbedBuilder.from(msg.embeds[0])
                .setDescription(`----------------------------------------\n💎 **ของรางวัล:** ${data.prize}\n👑 **ผู้จัดกิจกรรม:** <@${data.host}>\n🏆 **จำนวนผู้โชคดี:** ${data.winnerCount} ท่าน\n----------------------------------------\n\n⏳ **เวลาที่เหลือ:**\n${createProgressBar(percent)} ${percent}%\nสิ้นสุดใน: <t:${discordTimestamp}:R>\n\n👇 **กด 🎁 ด้านล่างเพื่อเข้าร่วมกิจกรรม!**`);
            await msg.edit({ embeds: [updatedEmbed] });
        } catch (e) {
            clearInterval(data.interval);
        }
    }, updateIntervalTime);

    setTimeout(async () => {
        clearInterval(data.interval);
        const currentData = giveawayData.get(msgId);
        if (!currentData) return;

        try {
            const msg = await channel.messages.fetch(msgId);
            const disabledButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('join_giveaway').setLabel('กิจกรรมสิ้นสุดแล้ว').setEmoji('🔒').setStyle(ButtonStyle.Secondary).setDisabled(true)
            );

            const finalEmbed = EmbedBuilder.from(msg.embeds[0])
                .setTitle('🔒 กิจกรรมสิ้นสุดแล้ว! 🔒')
                .setDescription(`----------------------------------------\n💎 **ของรางวัล:** ${currentData.prize}\n👑 **ผู้จัดกิจกรรม:** <@${currentData.host}>\n🏆 **จำนวนผู้โชคดี:** ${currentData.winnerCount} ท่าน\n----------------------------------------\n\n⏳ **สถานะ:** กิจกรรมจบลงแล้ว!\n${createProgressBar(100)} 100%`)
                .setColor('#36393F');
            
            await msg.edit({ embeds: [finalEmbed], components: [disabledButton] });

            if (currentData.participants.length === 0) {
                await channel.send({ content: `อ่าว... ไม่มีใครเข้าร่วมกิจกรรมนี้เลยค่ะซีม่อน 😢` });
            } else {
                const actualWinnersCount = Math.min(currentData.winnerCount, currentData.participants.length);
                const winners = [];
                const participants = [...currentData.participants];
                
                for (let i = 0; i < actualWinnersCount; i++) {
                    const randomIndex = Math.floor(Math.random() * participants.length);
                    winners.push(participants[randomIndex]);
                    participants.splice(randomIndex, 1); 
                }

                const winnersMentions = winners.map(id => `<@${id}>`).join(', ');
                const winEmbed = new EmbedBuilder()
                    .setTitle('🎊 ยินดีด้วยกับผู้โชคดี! 🎊')
                    .setDescription(`----------------------------------------\n🎁 **รางวัล:** ${currentData.prize}\n👤 **ผู้โชคดี:** ${winnersMentions}\n----------------------------------------\n\n📌 **วิธีรับรางวัล:** ติดต่อที่ Ticket ได้เลยนะคะ 💖`)
                    .setColor('#FFD700')
                    .setImage('https://placehold.co/600x200/ffafbd/ffffff?text=WINNER')
                    .setFooter({ text: 'Zemon Źx Bot • ระบบสุ่มคุณภาพ' });

                const announceMsg = await channel.send({ content: `🎉 ยินดีด้วยครับ! ${winnersMentions} คุณได้รับ **${currentData.prize}** !`, embeds: [winEmbed] });

                setTimeout(() => {
                    msg.delete().catch(() => null);
                    announceMsg.delete().catch(() => null);
                    giveawayData.delete(msgId); 
                }, 36000000); 
            }
        } catch (e) { console.error("Error ending giveaway:", e); }
    }, data.durationMs);
}

// ==========================================
// ส่วนที่ 3: ระบบ Discord Bot Commands
// ==========================================
client.on('ready', async () => {
    console.log(`💖 ปายล็อกอินแล้วในชื่อ ${client.user.tag}`);

    const commands = [
        {
            name: 'setup-ticket',
            description: 'สร้างหน้าต่าง Panel สำหรับเปิด Ticket',
        },
        {
            name: 'addbot-status',
            description: 'เพิ่มบอทลงในหน้าเว็บสถานะ',
            options: [{ name: 'bot', description: 'เลือกบอท', type: 6, required: true }]
        },
        {
            name: 'giveaway',
            description: 'สร้างกิจกรรมแจกรางวัล',
            options: [
                { name: 'prize', description: 'ของรางวัล', type: 3, required: true },
                { name: 'duration', description: 'เวลา (10s, 5m, 1h)', type: 3, required: true },
                { name: 'winners', description: 'จำนวนผู้ชนะ (1-5)', type: 4, required: true }
            ]
        },
        {
            name: 'announce',
            description: 'ส่งข้อความประกาศแบบ Embed (เลือกรูปได้)',
            options: [
                { name: 'channel', description: 'เลือกช่องที่จะโพสต์', type: 7, required: true },
                { name: 'title', description: 'หัวข้อประกาศ', type: 3, required: true },
                { name: 'message', description: 'เนื้อหา (พิมพ์ \\n เพื่อขึ้นบรรทัดใหม่)', type: 3, required: true },
                { name: 'image', description: 'ใส่ Link รูปภาพ (เลือกได้)', type: 3, required: false },
                { name: 'color', description: 'โค้ดสี Hex (เช่น #ff0000) ถ้าไม่ใส่จะเป็นสีขาว', type: 3, required: false }
            ]
        }
    ];

    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✨ ปายลงทะเบียนคำสั่งเรียบร้อย!');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    // Slash Commands
    if (interaction.isChatInputCommand()) {
        if (interaction.user.id !== SIMON_ID) return interaction.reply({ content: 'เฉพาะซีม่อนใช้ได้นะคะ! 🥺', ephemeral: true });

        // --- Setup Ticket ---
        if (interaction.commandName === 'setup-ticket') {
            const embed = new EmbedBuilder()
                .setTitle('🎫 ศูนย์ช่วยเหลือ / ติดต่อสอบถาม')
                .setDescription('หากมีข้อสงสัย หรือต้องการติดต่อทีมงาน\nกดปุ่ม **"เปิด Ticket"** ด้านล่างได้เลยค่ะ ✨')
                .setColor('#FFB6C1')
                .setFooter({ text: 'Zemon Źx Bot' });

            const button = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_ticket').setLabel('เปิด Ticket').setEmoji('📩').setStyle(ButtonStyle.Success)
            );

            await interaction.reply({ content: 'สร้าง Panel แล้วค่ะ!', ephemeral: true });
            await interaction.channel.send({ embeds: [embed], components: [button] });
        }

        // --- Add Bot ---
        if (interaction.commandName === 'addbot-status') {
            const targetBot = interaction.options.getUser('bot');
            if (!targetBot.bot) return interaction.reply({ content: 'ต้องเลือกบอทเท่านั้นค่ะ!', ephemeral: true });
            trackedBots.set(targetBot.id, Date.now());
            await interaction.reply({ content: `✅ เพิ่ม **${targetBot.username}** แล้วค่ะ!`, ephemeral: true });
        }

        // --- Giveaway ---
        if (interaction.commandName === 'giveaway') {
            const prize = interaction.options.getString('prize');
            const durationMs = parseTime(interaction.options.getString('duration'));
            const winnerCount = interaction.options.getInteger('winners');
            
            if (!durationMs) return interaction.reply({ content: 'รูปแบบเวลาผิดค่ะ!', ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle('🎉 ZEMON ŹX : GIVEAWAY EVENT 🎉')
                .setDescription(`----------------------------------------\n💎 **ของรางวัล:** ${prize}\n👑 **ผู้จัด:** <@${SIMON_ID}>\n🏆 **ผู้โชคดี:** ${winnerCount} ท่าน\n\n⏳ **รอคนเข้าร่วมคนแรกเพื่อเริ่มนับเวลา...**`)
                .setColor('#FF0000')
                .setFooter({ text: 'Zemon Źx Bot' });

            const button = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('join_giveaway').setLabel('เข้าร่วมกิจกรรม').setEmoji('🎁').setStyle(ButtonStyle.Success)
            );

            await interaction.reply({ content: 'เริ่มกิจกรรมแล้วค่ะ!', ephemeral: true });
            const gMsg = await interaction.channel.send({ embeds: [embed], components: [button] });

            giveawayData.set(gMsg.id, { 
                participants: [], prize, winnerCount, host: SIMON_ID, durationMs, hasStarted: false, interval: null 
            });
        }

        // --- Announce (ปรับปรุงใหม่!) ---
        if (interaction.commandName === 'announce') {
            const targetChannel = interaction.options.getChannel('channel');
            const title = interaction.options.getString('title');
            const message = interaction.options.getString('message').replace(/\\n/g, '\n');
            const imageUrl = interaction.options.getString('image');
            const colorInput = interaction.options.getString('color') || '#FFFFFF';

            if (targetChannel.type !== ChannelType.GuildText && targetChannel.type !== ChannelType.GuildAnnouncement) {
                return interaction.reply({ content: 'เลือกได้เฉพาะห้องแชทนะคะ!', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle(`📢 ${title}`)
                .setDescription(message)
                .setColor(colorInput.startsWith('#') ? colorInput : `#${colorInput}`)
                .setTimestamp()
                .setFooter({ text: 'Zemon Źx Official', iconURL: interaction.guild.iconURL() });

            // เพิ่มรูปภาพถ้าซีม่อนใส่ Link มา
            if (imageUrl) {
                embed.setImage(imageUrl);
            }

            try {
                // ส่ง Tag @everyone แบบซ่อนในแถบสีดำ
                await targetChannel.send({ content: `|| @everyone ||`, embeds: [embed] });
                await interaction.reply({ content: `✅ ประกาศที่ห้อง ${targetChannel} เรียบร้อยแล้วค่ะซีม่อน! 🎉`, ephemeral: true });
            } catch (e) {
                await interaction.reply({ content: 'บอทไม่มีสิทธิ์ส่งข้อความในห้องนั้นค่ะ! ลองเช็คสิทธิ์ให้ปายหน่อยน้า 🥺', ephemeral: true });
            }
        }
    }

    // Button Interactions
    if (interaction.isButton()) {
        if (interaction.customId === 'join_giveaway') {
            const data = giveawayData.get(interaction.message.id);
            if (!data) return interaction.reply({ content: 'กิจกรรมจบไปแล้วค่ะ!', ephemeral: true });
            if (data.participants.includes(interaction.user.id)) return interaction.reply({ content: 'คุณเข้าร่วมไปแล้วน้า!', ephemeral: true });

            data.participants.push(interaction.user.id);
            if (!data.hasStarted) startGiveawayTimer(interaction.message.id, interaction.channel);
            await interaction.reply({ content: '🎉 เข้าร่วมแล้ว! ขอให้โชคดีนะคะ ✨', ephemeral: true });
        }

        if (interaction.customId === 'open_ticket') {
            const guild = interaction.guild;
            const user = interaction.user;
            const ticketChannel = await guild.channels.create({
                name: `ticket-${user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                    { id: SIMON_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
                ],
            });
            const embed = new EmbedBuilder().setTitle(`สวัสดีค่ะคุณ ${user.username}`).setDescription('รอสักครู่ เดี๋ยวซีม่อนจะมาดูแลนะคะ 🎀').setColor('#ADD8E6');
            const btn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('ปิด Ticket').setStyle(ButtonStyle.Danger));
            await ticketChannel.send({ content: `<@${user.id}> | <@${SIMON_ID}>`, embeds: [embed], components: [btn] });
            await interaction.reply({ content: `สร้างห้อง ${ticketChannel} แล้วค่ะ 💖`, ephemeral: true });
        }

        if (interaction.customId === 'close_ticket') {
            if (interaction.user.id !== SIMON_ID) return interaction.reply({ content: 'ซีม่อนปิดได้คนเดียวจ้า!', ephemeral: true });
            await interaction.reply('กำลังลบห้องใน 3 วินาที...');
            setTimeout(() => { interaction.channel.delete().catch(() => null); }, 3000);
        }
    }
});

client.login(TOKEN);
