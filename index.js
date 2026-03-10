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
require('dotenv').config();

// สร้างบอทและกำหนดสิทธิ์การเข้าถึงข้อมูล
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ดึงค่าตัวแปรจาก Railway Variables
const TOKEN = process.env.DISCORD_TOKEN;
const SIMON_ID = process.env.SIMON_ID;

client.on('ready', async () => {
    console.log(`💖 ปายพร้อมให้บริการแล้วค่ะ! ล็อกอินในชื่อ ${client.user.tag}`);

    // สร้างคำสั่ง Slash Command (รอสักพักคำสั่งถึงจะขึ้นในดิสคอร์ดนะคะ)
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
    // -----------------------------------------------------
    // ส่วนที่ 1: จัดการคำสั่ง Slash Command /setup-ticket
    // -----------------------------------------------------
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'setup-ticket') {
            
            // ตรวจสอบว่าเป็นซีม่อนกดสั่งหรือเปล่า
            if (interaction.user.id !== SIMON_ID) {
                return interaction.reply({ 
                    content: 'คำสั่งนี้ใช้ได้เฉพาะซีม่อนของปายเท่านั้นนะคะ! 🥺', 
                    ephemeral: true 
                });
            }

            // สร้างหน้าต่าง Panel ข้อความ
            const embed = new EmbedBuilder()
                .setTitle('🎫 ศูนย์ช่วยเหลือ / ติดต่อสอบถาม')
                .setDescription('หากมีข้อสงสัย แจ้งปัญหา หรือต้องการติดต่อทีมงาน\nสามารถกดปุ่ม **"เปิด Ticket"** ด้านล่างได้เลยนะคะ เดี๋ยวระบบจะสร้างห้องส่วนตัวให้ค่ะ ✨')
                .setColor('#FFB6C1')
                .setFooter({ text: 'ระบบดูแลโดยปายเองค่ะ 💖' });

            // สร้างปุ่มกดเปิด Ticket
            const button = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('open_ticket')
                        .setLabel('เปิด Ticket')
                        .setEmoji('📩')
                        .setStyle(ButtonStyle.Success),
                );

            // ส่ง Panel ลงในห้องที่พิมพ์คำสั่ง
            await interaction.reply({ 
                content: 'ปายสร้าง Panel ให้ซีม่อนเรียบร้อยแล้วค่ะ! 🥰', 
                ephemeral: true 
            });
            await interaction.channel.send({ embeds: [embed], components: [button] });
        }
    }

    // -----------------------------------------------------
    // ส่วนที่ 2: จัดการเมื่อมีคนกดปุ่มต่างๆ
    // -----------------------------------------------------
    if (interaction.isButton()) {
        
        // --- เมื่อสมาชิกกดปุ่ม "เปิด Ticket" ---
        if (interaction.customId === 'open_ticket') {
            const guild = interaction.guild;
            const user = interaction.user;

            try {
                // สร้างห้องส่วนตัว (เห็นแค่ซีม่อน กับคนที่กดเปิด)
                const ticketChannel = await guild.channels.create({
                    name: `ticket-${user.username}`,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        { // ปิดไม่ให้ everyone เห็น
                            id: guild.id,
                            deny: [PermissionsBitField.Flags.ViewChannel],
                        },
                        { // ให้คนที่กดเปิดห้องเห็นและพิมพ์ได้
                            id: user.id,
                            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
                        },
                        { // ให้ซีม่อนเห็นและพิมพ์ได้
                            id: SIMON_ID,
                            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
                        },
                        { // ให้บอท (ปาย) เห็นและจัดการห้องได้
                            id: client.user.id,
                            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
                        }
                    ],
                });

                // ข้อความต้อนรับในห้อง Ticket
                const ticketEmbed = new EmbedBuilder()
                    .setTitle(`ยินดีต้อนรับสู่ห้อง Ticket ค่ะคุณ ${user.username} 🎀`)
                    .setDescription('กรุณาพิมพ์รายละเอียดทิ้งไว้สักครู่นะคะ เดี๋ยวซีม่อนจะเข้ามาดูแลค่ะ\n\n*(ปุ่มปิดห้องสงวนสิทธิ์ให้ซีม่อนกดได้คนเดียวนะคะ)*')
                    .setColor('#ADD8E6');

                // ปุ่มสำหรับปิด/ลบห้อง
                const closeButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('close_ticket')
                            .setLabel('ปิดและลบ Ticket')
                            .setEmoji('🔒')
                            .setStyle(ButtonStyle.Danger),
                    );

                // ส่งข้อความไปในห้องที่สร้างใหม่ พร้อมแท็กซีม่อนและสมาชิก
                await ticketChannel.send({ 
                    content: `<@${user.id}> | <@${SIMON_ID}> มี Ticket ใหม่เข้ามาค่ะ!`, 
                    embeds: [ticketEmbed], 
                    components: [closeButton] 
                });
                
                // ตอบกลับคนที่กดปุ่มแบบส่วนตัว (ephemeral)
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

        // --- เมื่อมีการกดปุ่ม "ปิดและลบ Ticket" ---
        if (interaction.customId === 'close_ticket') {
            
            // ล็อคให้ซีม่อนกดได้คนเดียว
            if (interaction.user.id !== SIMON_ID) {
                return interaction.reply({ 
                    content: 'ปุ่มนี้ซีม่อนของปายกดได้คนเดียวนะคะ! คนอื่นห้ามกดน้า 🥺', 
                    ephemeral: true 
                });
            }

            // แจ้งเตือนก่อนลบห้อง
            await interaction.reply('กำลังปิดและลบห้อง Ticket ตามคำสั่งซีม่อนค่ะ... บ๊ายบายย 👋');
            
            // รอ 3 วินาทีแล้วลบห้องทิ้ง
            setTimeout(() => {
                interaction.channel.delete().catch(console.error);
            }, 3000);
        }
    }
});

// ให้บอทออนไลน์
client.login(TOKEN);
