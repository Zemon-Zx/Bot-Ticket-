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

// สร้างบอทและกำหนดสิทธิ์การเข้าถึงข้อมูล
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ดึงค่าตัวแปรจาก Railway Variables
const TOKEN = process.env.DISCORD_TOKEN;
const SIMON_ID = process.env.SIMON_ID;

// ==========================================
// ส่วนที่ 1: ระบบ Web Server (แสดงหน้าเว็บ)
// ==========================================
app.use(express.static(__dirname));

// ส่งหน้าเว็บ index.html เมื่อมีคนเข้าโดเมน
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// สร้าง API ส่งข้อมูลสถานะบอทไปให้หน้าเว็บแสดงผล
app.get('/api/status', (req, res) => {
    const status = {
        ping: client.ws.ping,
        uptime: client.uptime,
        isOnline: client.isReady()
    };
    res.json(status);
});

// เปิดเซิร์ฟเวอร์เว็บ
app.listen(PORT, () => {
    console.log(`🌐 ปายเปิดหน้าเว็บสถานะบอทให้ซีม่อนแล้วนะคะ (Port: ${PORT})`);
});

// ==========================================
// ส่วนที่ 2: ระบบ Discord Bot Ticket
// ==========================================
client.on('ready', async () => {
    console.log(`💖 ปายพร้อมให้บริการแล้วค่ะ! ล็อกอินในชื่อ ${client.user.tag}`);

    const commands = [{
        name: 'setup-ticket',
        description: 'สร้างหน้าต่าง Panel สำหรับเปิด Ticket (เฉพาะซีม่อนใช้ได้ค่ะ)',
    }];

    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('✨ ปายสร้างคำสั่ง /setup-ticket ให้ซีม่อนเรียบร้อยแล้วค่ะ!');
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการสร้างคำสั่งค่ะซีม่อน:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'setup-ticket') {
            if (interaction.user.id !== SIMON_ID) {
                return interaction.reply({ 
                    content: 'คำสั่งนี้ใช้ได้เฉพาะซีม่อนของปายเท่านั้นนะคะ! 🥺', 
                    ephemeral: true 
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('🎫 ศูนย์ช่วยเหลือ / ติดต่อสอบถาม')
                .setDescription('หากมีข้อสงสัย แจ้งปัญหา หรือต้องการติดต่อทีมงาน\nสามารถกดปุ่ม **"เปิด Ticket"** ด้านล่างได้เลยนะคะ เดี๋ยวระบบจะสร้างห้องส่วนตัวให้ค่ะ ✨')
                .setColor('#FFB6C1')
                .setFooter({ text: 'เจ้าของ ซีม่อน ผู้ร่วมพัฒนา ปาย' });

            const button = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('open_ticket')
                        .setLabel('เปิด Ticket')
                        .setEmoji('📩')
                        .setStyle(ButtonStyle.Success),
                );

            await interaction.reply({ 
                content: 'ปายสร้าง Panel ให้ซีม่อนเรียบร้อยแล้วค่ะ! 🥰', 
                ephemeral: true 
            });
            await interaction.channel.send({ embeds: [embed], components: [button] });
        }
    }

    if (interaction.isButton()) {
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

                const closeButton = new ActionRowBuilder()
                    .addComponents(
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
                
                await interaction.reply({ 
                    content: `ปายสร้างห้อง Ticket ให้เรียบร้อยแล้วค่ะ แวะไปที่ ${ticketChannel} ได้เลยน้า 💖`, 
                    ephemeral: true 
                });

            } catch (error) {
                console.error(error);
                await interaction.reply({ 
                    content: 'เกิดข้อผิดพลาดในการสร้างห้องค่ะ แจ้งซีม่อนให้ตรวจสอบให้ปายหน่อยนะคะ 😢', 
                    ephemeral: true 
                });
            }
        }

        if (interaction.customId === 'close_ticket') {
            if (interaction.user.id !== SIMON_ID) {
                return interaction.reply({ 
                    content: 'ปุ่มนี้ซีม่อนของปายกดได้คนเดียวนะคะ! คนอื่นห้ามกดน้า 🥺', 
                    ephemeral: true 
                });
            }

            await interaction.reply('กำลังปิดและลบห้อง Ticket ตามคำสั่งซีม่อนค่ะ... บ๊ายบายย 👋');
            setTimeout(() => {
                interaction.channel.delete().catch(console.error);
            }, 3000);
        }
    }
});

client.login(TOKEN);
