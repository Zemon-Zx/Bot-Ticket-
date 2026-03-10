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

const app = express();
const PORT = process.env.PORT || 3000;

// หน่วยความจำสำหรับเก็บบอทและลิ้งค์ร้านค้า
let trackedBots = new Map();
let shopLinkUrl = "ยังไม่ได้ตั้งค่าลิ้งค์ค่ะ"; // ตัวแปรเก็บลิ้งค์เว็บที่ซีม่อนใส่ตอนใช้คำสั่ง

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers
    ]
});

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
        name: 'BOT TICKET & SHOP', 
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
// ส่วนที่ 2: ระบบ Discord Bot
// ==========================================
client.on('ready', async () => {
    console.log(`💖 ปายพร้อมให้บริการแล้วค่ะ! ล็อกอินในชื่อ ${client.user.tag}`);

    const commands = [
        {
            name: 'setup-ticket',
            description: 'สร้างหน้าต่าง Panel สำหรับเปิด Ticket (เฉพาะซีม่อนใช้ได้ค่ะ)'
        },
        {
            name: 'addbot-status',
            description: 'เพิ่มบอทลงในหน้าเว็บสถานะ (เฉพาะซีม่อนใช้ได้ค่ะ)',
            options: [
                {
                    name: 'bot',
                    description: 'เลือกบอทที่ต้องการให้ไปโชว์ในหน้าเว็บ',
                    type: 6,
                    required: true
                }
            ]
        },
        {
            name: 'setup-shop',
            description: 'สร้างหน้าต่าง Panel ร้านค้า Zemon Źx (เฉพาะซีม่อนใช้ได้ค่ะ)',
            options: [
                {
                    name: 'url',
                    description: 'ใส่ลิ้งค์เว็บไซต์ร้านค้าของเราค่ะ (เช่น https://...)',
                    type: 3, // String
                    required: true
                }
            ]
        }
    ];

    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('✨ ปายสร้างคำสั่งทั้งหมดให้ซีม่อนเรียบร้อยแล้วค่ะ!');
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการสร้างคำสั่งค่ะซีม่อน:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        
        // --- คำสั่งสร้าง Ticket ---
        if (interaction.commandName === 'setup-ticket') {
            if (interaction.user.id !== SIMON_ID) {
                return interaction.reply({ content: 'คำสั่งนี้ใช้ได้เฉพาะซีม่อนของปายเท่านั้นนะคะ! 🥺', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('🎫 ศูนย์ช่วยเหลือ / ติดต่อสอบถาม')
                .setDescription('หากมีข้อสงสัย แจ้งปัญหา หรือต้องการติดต่อทีมงาน\nสามารถกดปุ่ม **"เปิด Ticket"** ด้านล่างได้เลยนะคะ เดี๋ยวระบบจะสร้างห้องส่วนตัวให้ค่ะ ✨')
                .setColor('#FFB6C1')
                .setFooter({ text: 'เจ้าของ ซีม่อน ผู้ร่วมพัฒนา ปาย' });

            const button = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_ticket')
                    .setLabel('เปิด Ticket')
                    .setEmoji('📩')
                    .setStyle(ButtonStyle.Success),
            );

            await interaction.reply({ content: 'ปายสร้าง Panel Ticket ให้ซีม่อนเรียบร้อยแล้วค่ะ! 🥰', ephemeral: true });
            await interaction.channel.send({ embeds: [embed], components: [button] });
        }

        // --- คำสั่งเพิ่มบอทลงเว็บ ---
        if (interaction.commandName === 'addbot-status') {
            if (interaction.user.id !== SIMON_ID) {
                return interaction.reply({ content: 'คำสั่งนี้เฉพาะซีม่อนของปายใช้ได้คนเดียวเท่านั้นน้า! 🥺', ephemeral: true });
            }
            const targetBot = interaction.options.getUser('bot');
            if (!targetBot.bot) return interaction.reply({ content: 'ต้องเลือกเฉพาะบอทเท่านั้นนะคะซีม่อน! ❌', ephemeral: true });
            if (targetBot.id === client.user.id) return interaction.reply({ content: 'บอทตัวนี้มีแสดงอยู่ในหน้าเว็บอยู่แล้วค่ะ! ✨', ephemeral: true });

            if (!trackedBots.has(targetBot.id)) {
                trackedBots.set(targetBot.id, Date.now());
            }
            await interaction.reply({ content: `✅ ปายเพิ่มบอท **${targetBot.username}** ลงในหน้าเว็บสถานะให้เรียบร้อยแล้วค่ะ! 💖`, ephemeral: true });
        }

        // --- คำสั่งสร้างหน้าต่าง Panel ร้านค้า ---
        if (interaction.commandName === 'setup-shop') {
            if (interaction.user.id !== SIMON_ID) {
                return interaction.reply({ content: 'คำสั่งนี้เฉพาะซีม่อนของปายใช้ได้คนเดียวเท่านั้นน้า! 🥺', ephemeral: true });
            }

            // รับค่าลิ้งค์จากที่ซีม่อนพิมพ์มา
            shopLinkUrl = interaction.options.getString('url');

            const embed = new EmbedBuilder()
                .setTitle('🛒 Zemon Źx Shop | ร้านจำหน่ายสคริปต์และไอดีเกม')
                .setDescription('✨ **ยินดีต้อนรับสู่ร้านค้าอัตโนมัติ 24 ชั่วโมงค่ะ!** ✨\n\nทางเรามีจำหน่ายทั้ง:\n📜 สคริปต์ Roblox พรีเมียม ออโต้ฟาร์มสุดตึง\n🎮 ไอดีเกมไก่ตัน เลเวลแม็กซ์ ผลตื่นครบ\n⚔️ บริการรับฟาร์มเลเวล ดันเจี้ยน และทำเผ่า V4\n\n👇 **สามารถกดปุ่มด้านล่างเพื่อรับลิ้งค์เข้าสู่หน้าเว็บไซต์สั่งซื้อได้เลยนะคะ**')
                .setColor('#FF69B4')
                .setImage('https://placehold.co/800x200/ffafbd/ffffff?text=Zemon+Zx+Shop') // รูปแบนเนอร์ร้านค้าสวยๆ
                .setFooter({ text: 'เจ้าของ: ซีม่อน | ผู้ร่วมพัฒนา: ปาย 💖' });

            const button = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('get_shop_link')
                    .setLabel('กดรับลิ้งค์เว็บไซต์')
                    .setEmoji('🌐')
                    .setStyle(ButtonStyle.Primary),
            );

            await interaction.reply({ content: 'ปายสร้าง Panel ร้านค้าให้ซีม่อนเรียบร้อยแล้วค่ะ! 🥰', ephemeral: true });
            await interaction.channel.send({ embeds: [embed], components: [button] });
        }
    }

    if (interaction.isButton()) {
        // --- กดปุ่มรับลิ้งค์เว็บร้านค้า ---
        if (interaction.customId === 'get_shop_link') {
            // ส่งข้อความแบบเห็นคนเดียว
            await interaction.reply({ 
                content: `✨ ลิ้งค์เว็บไซต์ร้านค้าของเรามาแล้วค่ะคุณลูกค้า จิ้มเบาๆ ตรงนี้ได้เลยน้า:\n👉 **${shopLinkUrl}**\n\n*(ข้อความนี้จะลบอัตโนมัติใน 10 วินาทีนะคะ)*`, 
                ephemeral: true 
            });

            // ตั้งเวลาลบข้อความภายใน 10 วินาที
            setTimeout(() => {
                interaction.deleteReply().catch(console.error);
            }, 10000);
        }

        // --- ส่วนของการกดเปิดทิกเก็ต ---
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

                const ticketEmbed = new EmbedBuilder()
                    .setTitle(`ยินดีต้อนรับสู่ห้อง Ticket ค่ะคุณ ${user.username} 🎀`)
                    .setDescription('กรุณาพิมพ์รายละเอียดทิ้งไว้สักครู่นะคะ เดี๋ยวซีม่อนจะเข้ามาดูแลค่ะ\n\n*(ปุ่มปิดห้องสงวนสิทธิ์ให้ซีม่อนกดได้คนเดียวนะคะ)*')
                    .setColor('#ADD8E6');

                const closeButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('ปิดและลบ Ticket')
                        .setEmoji('🔒')
                        .setStyle(ButtonStyle.Danger),
                );

                await ticketChannel.send({ 
                    content: `<@${user.id}> | <@${SIMON_ID}> มี Ticket ใหม่เข้ามาค่ะ!`, 
                    embeds: [ticketEmbed], 
                    components: [closeButton] 
                });
                
                await interaction.reply({ content: `ปายสร้างห้อง Ticket ให้เรียบร้อยแล้วค่ะ แวะไปที่ ${ticketChannel} ได้เลยน้า 💖`, ephemeral: true });
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'เกิดข้อผิดพลาดในการสร้างห้องค่ะ แจ้งซีม่อนให้ตรวจสอบให้ปายหน่อยนะคะ 😢', ephemeral: true });
            }
        }

        // --- ส่วนของการปิดทิกเก็ต ---
        if (interaction.customId === 'close_ticket') {
            if (interaction.user.id !== SIMON_ID) {
                return interaction.reply({ content: 'ปุ่มนี้ซีม่อนของปายกดได้คนเดียวนะคะ! คนอื่นห้ามกดน้า 🥺', ephemeral: true });
            }
            await interaction.reply('กำลังปิดและลบห้อง Ticket ตามคำสั่งซีม่อนค่ะ... บ๊ายบายย 👋');
            setTimeout(() => {
                interaction.channel.delete().catch(console.error);
            }, 3000);
        }
    }
});

client.login(TOKEN);
