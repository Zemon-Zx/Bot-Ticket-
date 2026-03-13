const {
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, 
    REST, Routes, Collection, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const express = require('express');
const path = require('path');
require('dotenv').config();

// --- การตั้งค่าเริ่มต้น ---
const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const SIMON_ID = process.env.SIMON_ID;

// --- หน่วยความจำ (Database จำลอง) ---
let trackedBots = new Map();
let giveawayData = new Map();
let userLevels = new Map(); 
let levelRoles = new Map(); 
let verifyRoles = { member: null, male: null, female: null }; // เก็บยศยืนยันตัวตน
const chatCooldown = new Set();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates
    ]
});

// ==========================================
// 1. ระบบ WEB SERVER (Railway Status)
// ==========================================
app.use(express.static(__dirname));
app.get('/', (req, res) => res.send('Zemon Źx Bot is Online! 💖'));
app.get('/api/status', async (req, res) => {
    const botsData = [{
        id: client.user.id, name: 'Zemon Źx Bot', isMain: true,
        isOnline: client.isReady(), ping: client.ws.ping, uptime: client.uptime
    }];
    const guild = client.guilds.cache.first();
    if (guild) {
        for (const [botId, startTime] of trackedBots.entries()) {
            const member = await guild.members.fetch(botId).catch(() => null);
            if (member) {
                const isOnline = member.presence && member.presence.status !== 'offline';
                botsData.push({
                    id: member.user.id, name: member.user.username, isMain: false,
                    isOnline, ping: isOnline ? 40 + Math.floor(Math.random() * 20) : 0, 
                    uptime: isOnline ? (Date.now() - startTime) : 0
                });
            }
        }
    }
    res.json(botsData);
});
app.listen(PORT, () => console.log(`🌐 Web Status Ready on Port: ${PORT}`));

// ==========================================
// 2. ฟังก์ชันช่วยงาน (Helper Functions)
// ==========================================
const parseTime = (t) => {
    const unit = t.slice(-1); const val = parseInt(t.slice(0, -1));
    if (isNaN(val)) return null;
    return { 's': 1000, 'm': 60000, 'h': 3600000, 'd': 86400000 }[unit] * val || null;
};

const createBar = (pct) => {
    const size = 15; const filled = Math.round((pct / 100) * size);
    return '⚪'.repeat(Math.max(0, Math.min(size, filled))) + '⚫'.repeat(Math.max(0, size - filled));
};

const getXpNeeded = (lv) => Math.floor(500 * Math.pow(lv, 1.6)); // สูตรอัปยาก

async function handleLevelUp(userId, guild, amount) {
    if (!userLevels.has(userId)) userLevels.set(userId, { xp: 0, level: 1 });
    let data = userLevels.get(userId);
    data.xp += amount;

    if (data.xp >= getXpNeeded(data.level)) {
        data.level++; data.xp = 0;
        const roleId = levelRoles.get(data.level);
        if (roleId) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) await member.roles.add(roleId).catch(() => null);
        }
        return true;
    }
    return false;
}

// ==========================================
// 3. ระบบ GIVEAWAY LOGIC
// ==========================================
async function runGiveaway(msgId, channel) {
    const d = giveawayData.get(msgId); if (!d || d.active) return;
    d.active = true; const end = Date.now() + d.duration;

    const timer = setInterval(async () => {
        const remaining = end - Date.now();
        const pct = Math.floor(((d.duration - remaining) / d.duration) * 100);
        const msg = await channel.messages.fetch(msgId).catch(() => null);
        if (!msg || remaining <= 0) return clearInterval(timer);

        const emb = EmbedBuilder.from(msg.embeds[0]).setDescription(`----------------------------------------\n🎁 **ของรางวัล:** ${d.prize}\n👑 **ผู้จัด:** <@${d.host}>\n🏆 **จำนวนผู้ชนะ:** ${d.winners} ท่าน\n----------------------------------------\n\n⏳ **เวลาที่เหลือ:**\n${createBar(pct)} ${pct}%\nสิ้นสุดใน: <t:${Math.floor(end/1000)}:R>`);
        await msg.edit({ embeds: [emb] });
    }, Math.max(d.duration / 10, 5000));

    setTimeout(async () => {
        clearInterval(timer);
        const cur = giveawayData.get(msgId);
        const msg = await channel.messages.fetch(msgId).catch(() => null);
        if (!msg) return;

        const winners = cur.users.sort(() => 0.5 - Math.random()).slice(0, cur.winners);
        const winList = winners.length > 0 ? winners.map(id => `<@${id}>`).join(', ') : 'ไม่มีผู้เข้าร่วม';
        
        const finalEmb = EmbedBuilder.from(msg.embeds[0]).setTitle('🔒 กิจกรรมจบลงแล้ว').setColor('#36393F');
        await msg.edit({ embeds: [finalEmb], components: [] });
        
        if (winners.length > 0) {
            channel.send({ content: `🎉 ยินดีด้วย! ${winList} คุณได้รับ **${cur.prize}**!`, embeds: [new EmbedBuilder().setTitle('🎊 ประกาศผลผู้โชคดี').setDescription(`🎁 **รางวัล:** ${cur.prize}\n👤 **ผู้โชคดี:** ${winList}`).setColor('#FFD700').setFooter({ text: 'ติดต่อรับรางวัลที่ Ticket นะคะ' })] });
        }
        giveawayData.delete(msgId);
    }, d.duration);
}

// ==========================================
// 4. EVENTS & COMMANDS REGISTRATION
// ==========================================
client.on('ready', async () => {
    console.log(`💖 ปายพร้อมดูแลซีม่อนแล้วในชื่อ ${client.user.tag}`);
    const cmds = [
        { name: 'setup-ticket', description: 'สร้างระบบ Ticket' },
        { name: 'giveaway', description: 'เริ่มกิจกรรมแจกของ', options: [{name:'prize',type:3,required:true,description:'รางวัล'},{name:'duration',type:3,required:true,description:'เวลา (1m, 1h)'},{name:'winners',type:4,required:true,description:'จำนวนคนชนะ'}] },
        { name: 'announce', description: 'ส่งประกาศประกาศ', options: [{name:'channel',type:7,required:true,description:'ช่อง'},{name:'title',type:3,required:true,description:'หัวข้อ'},{name:'message',type:3,required:true,description:'เนื้อหา'},{name:'image',type:3,description:'Link รูป'},{name:'color',type:3,description:'โค้ดสี'}] },
        { name: 'setup-level', description: 'ตั้งค่ายศเลเวล', options: [10,20,40,60,80,100].map(v => ({name:`lv${v}`,type:8,required:true,description:`ยศเลเวล ${v}`})) },
        { name: 'level-panel', description: 'สร้างหน้าเช็คเลเวล' },
        { name: 'addbot-status', description: 'เพิ่มบอทเช็คสถานะ', options: [{name:'bot',type:6,required:true,description:'บอท'}] },
        { 
            name: 'setup-verify', 
            description: 'สร้างระบบยืนยันตัวตน (รับยศและเพศอัตโนมัติ)', 
            options: [
                { name: 'member_role', type: 8, required: true, description: 'ยศสำหรับสมาชิกเมื่อยืนยันสำเร็จ' },
                { name: 'male_role', type: 8, required: true, description: 'ยศสำหรับผู้ชาย' },
                { name: 'female_role', type: 8, required: true, description: 'ยศสำหรับผู้หญิง' }
            ] 
        }
    ];
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: cmds });
});

// ==========================================
// 5. EVENT HANDLERS (XP & INTERACTIONS)
// ==========================================
// ระบบ XP จากแชท
client.on('messageCreate', async (m) => {
    if (m.author.bot || !m.guild || chatCooldown.has(m.author.id)) return;
    if (await handleLevelUp(m.author.id, m.guild, Math.floor(Math.random() * 10) + 5)) {
        m.reply(`🎊 เก่งมากค่ะ! ตอนนี้คุณเลเวล **${userLevels.get(m.author.id).level}** แล้วน้า!`).then(msg => setTimeout(() => msg.delete(), 5000));
    }
    chatCooldown.add(m.author.id);
    setTimeout(() => chatCooldown.delete(m.author.id), 60000);
});

// ระบบ XP จากห้องเสียง (ทุก 5 นาที)
setInterval(() => {
    client.guilds.cache.forEach(g => {
        g.voiceStates.cache.forEach(async s => {
            if (s.member && !s.member.user.bot && s.channelId && !s.mute) await handleLevelUp(s.member.id, g, 15);
        });
    });
}, 300000);

client.on('interactionCreate', async (i) => {
    // --- จัดการคำสั่ง (Slash Commands) ---
    if (i.isChatInputCommand()) {
        if (i.user.id !== SIMON_ID) return i.reply({ content: 'เฉพาะซีม่อนเท่านั้นนะคะ!', ephemeral: true });

        // --- สร้างหน้ารับยศยืนยันตัวตน ---
        if (i.commandName === 'setup-verify') {
            verifyRoles.member = i.options.getRole('member_role').id;
            verifyRoles.male = i.options.getRole('male_role').id;
            verifyRoles.female = i.options.getRole('female_role').id;

            const emb = new EmbedBuilder()
                .setTitle('🛡️ ระบบยืนยันตัวตน (Verification)')
                .setDescription('✨ **ยินดีต้อนรับสมาชิกใหม่ทุกท่านนะคะ!** ✨\n\nเพื่อความปลอดภัยและทำความรู้จักกัน\nรบกวนสมาชิกกดปุ่ม **"✅ ยืนยันตัวตน"** ด้านล่าง\nเพื่อกรอกข้อมูลและรับยศเข้าสู่เซิร์ฟเวอร์แบบเต็มรูปแบบค่ะ 💖\n\n📝 **สิ่งที่ต้องเตรียมกรอก:**\n> 👤 ชื่อเล่นของคุณ\n> 🎂 อายุ\n> ⚧️ เพศ (พิมพ์ ชาย หรือ หญิง)')
                .setColor('#FF69B4')
                .setThumbnail(i.guild.iconURL())
                .setFooter({ text: 'Zemon Źx Bot • ดูแลระบบปลอดภัย' });

            const btn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('verify_btn').setLabel('ยืนยันตัวตน').setEmoji('✅').setStyle(ButtonStyle.Success)
            );

            await i.reply({ content: '✅ บันทึกยศและสร้างหน้ายืนยันตัวตนเรียบร้อยแล้วค่ะ!', ephemeral: true });
            await i.channel.send({ embeds: [emb], components: [btn] });
        }

        // --- ระบบที่มีอยู่เดิม ---
        if (i.commandName === 'setup-ticket') {
            const emb = new EmbedBuilder().setTitle('🎫 ศูนย์ช่วยเหลือสมาชิก').setDescription('หากพบปัญหาหรือต้องการสอบถาม กดปุ่มด้านล่างได้เลยค่ะ').setColor('#FFB6C1');
            const btn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tk_open').setLabel('เปิด Ticket').setStyle(ButtonStyle.Success).setEmoji('📩'));
            await i.reply({ content: 'สร้างระบบสำเร็จ!', ephemeral: true });
            await i.channel.send({ embeds: [emb], components: [btn] });
        }

        if (i.commandName === 'giveaway') {
            const prize = i.options.getString('prize'); const dur = parseTime(i.options.getString('duration')); const win = i.options.getInteger('winners');
            if (!dur) return i.reply({ content: 'รูปแบบเวลาไม่ถูกต้องค่ะ (เช่น 5m, 1h)', ephemeral: true });
            const emb = new EmbedBuilder().setTitle('🎊 ZEMON GIVEAWAY 🎊').setDescription(`🎁 **รางวัล:** ${prize}\n👑 **โดย:** <@${SIMON_ID}>\n\n⏳ **กำลังรอผู้เข้าร่วมคนแรก...**`).setColor('#FF0000');
            const btn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gv_join').setLabel('เข้าร่วมกิจกรรม').setEmoji('🎁').setStyle(ButtonStyle.Primary));
            const msg = await i.channel.send({ embeds: [emb], components: [btn] });
            giveawayData.set(msg.id, { users: [], prize, winners: win, host: SIMON_ID, duration: dur, active: false });
            await i.reply({ content: 'เริ่มกิจกรรมแล้ว!', ephemeral: true });
        }

        if (i.commandName === 'announce') {
            const ch = i.options.getChannel('channel'); const title = i.options.getString('title'); const msg = i.options.getString('message').replace(/\\n/g, '\n');
            const img = i.options.getString('image'); const col = i.options.getString('color') || '#FFFFFF';
            const emb = new EmbedBuilder().setTitle(`📢 ${title}`).setDescription(msg).setColor(col.startsWith('#')?col:`#${col}`).setTimestamp().setFooter({text:'Zemon Official'});
            if (img) emb.setImage(img);
            await ch.send({ content: '|| @everyone ||', embeds: [emb] });
            await i.reply({ content: 'ประกาศสำเร็จ!', ephemeral: true });
        }

        if (i.commandName === 'setup-level') {
            [10,20,40,60,80,100].forEach(v => levelRoles.set(v, i.options.getRole(`lv${v}`).id));
            await i.reply({ content: '✅ ตั้งค่ายศเลเวลครบถ้วนแล้วค่ะซีม่อน!', ephemeral: true });
        }

        if (i.commandName === 'level-panel') {
            const emb = new EmbedBuilder().setTitle('📊 ตรวจสอบอันดับของคุณ').setDescription('กดปุ่มด้านล่างเพื่อดูเลเวลและ XP ปัจจุบันของคุณนะคะ').setColor('#5865F2');
            const btn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('lv_check').setLabel('เช็คเลเวล').setEmoji('📈').setStyle(ButtonStyle.Secondary));
            await i.reply({ content: 'สร้างแผงควบคุมเลเวลแล้วค่ะ', ephemeral: true });
            await i.channel.send({ embeds: [emb], components: [btn] });
        }

        if (i.commandName === 'addbot-status') {
            const b = i.options.getUser('bot'); if (!b.bot) return i.reply('ต้องเป็นบอทเท่านั้นค่ะ!');
            trackedBots.set(b.id, Date.now());
            await i.reply({ content: `✅ เพิ่ม ${b.username} เข้าระบบเช็คสถานะแล้ว`, ephemeral: true });
        }
    }

    // --- จัดการปุ่มกด (Buttons) ---
    if (i.isButton()) {
        // ปุ่มยืนยันตัวตน (เด้ง Modal)
        if (i.customId === 'verify_btn') {
            const modal = new ModalBuilder().setCustomId('verify_modal').setTitle('📝 ข้อมูลการยืนยันตัวตน');
            
            const nicknameInput = new TextInputBuilder().setCustomId('v_name').setLabel('ชื่อเล่นของคุณคืออะไร?').setPlaceholder('พิมพ์แค่ชื่อเล่น เช่น ซีม่อน').setStyle(TextInputStyle.Short).setRequired(true);
            const ageInput = new TextInputBuilder().setCustomId('v_age').setLabel('อายุเท่าไหร่คะ?').setPlaceholder('พิมพ์ตัวเลข เช่น 18').setStyle(TextInputStyle.Short).setRequired(true);
            const genderInput = new TextInputBuilder().setCustomId('v_gender').setLabel('เพศอะไรคะ? (ชาย / หญิง)').setPlaceholder('พิมพ์ว่า ชาย หรือ หญิง').setStyle(TextInputStyle.Short).setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nicknameInput),
                new ActionRowBuilder().addComponents(ageInput),
                new ActionRowBuilder().addComponents(genderInput)
            );
            await i.showModal(modal);
        }

        if (i.customId === 'lv_check') {
            const d = userLevels.get(i.user.id) || { xp: 0, level: 1 };
            const next = getXpNeeded(d.level); const pct = Math.floor((d.xp/next)*100);
            const emb = new EmbedBuilder().setTitle(`📉 Rank Card: ${i.user.username}`).setDescription(`----------------------------------------\n🔰 **Level:** \`${d.level}\`\n💠 **XP:** \`${d.xp.toLocaleString()} / ${next.toLocaleString()}\`\n----------------------------------------\n\n**Progress:**\n${createBar(pct)} ${pct}%\n*คุยกันบ่อยๆ เพื่อเลเวลที่สูงขึ้นนะคะ!*`).setColor('#00FF7F').setThumbnail(i.user.displayAvatarURL());
            await i.reply({ embeds: [emb], ephemeral: true });
            setTimeout(() => i.deleteReply().catch(() => null), 180000);
        }

        if (i.customId === 'tk_open') {
            const ch = await i.guild.channels.create({
                name: `ticket-${i.user.username}`,
                permissionOverwrites: [{ id: i.guild.id, deny: [8n] }, { id: i.user.id, allow: [1024n, 2048n, 32768n] }, { id: SIMON_ID, allow: [1024n, 2048n, 32768n] }]
            });
            const emb = new EmbedBuilder().setTitle('ยินดีต้อนรับสู่ Ticket').setDescription('รอซีม่อนสักครู่ เดี๋ยวจะรีบมาให้บริการนะคะ! 🎀').setColor('#ADD8E6');
            const btn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tk_close').setLabel('ปิด Ticket').setStyle(ButtonStyle.Danger));
            await ch.send({ content: `<@${i.user.id}> | <@${SIMON_ID}>`, embeds: [emb], components: [btn] });
            await i.reply({ content: `สร้างห้อง ${ch} ให้แล้วค่ะ!`, ephemeral: true });
        }

        if (i.customId === 'tk_close' && i.user.id === SIMON_ID) {
            await i.reply('ปิดห้องใน 3 วินาที...');
            setTimeout(() => i.channel.delete().catch(() => null), 3000);
        }

        if (i.customId === 'gv_join') {
            const d = giveawayData.get(i.message.id);
            if (!d) return i.reply({ content: 'กิจกรรมสิ้นสุดแล้วค่ะ!', ephemeral: true });
            if (d.users.includes(i.user.id)) return i.reply({ content: 'คุณเข้าร่วมไปแล้วน้า!', ephemeral: true });
            d.users.push(i.user.id);
            if (!d.active) runGiveaway(i.message.id, i.channel);
            await i.reply({ content: '🎉 เข้าร่วมสำเร็จ! ขอให้โชคดีนะคะ', ephemeral: true });
        }
    }

    // --- จัดการส่งฟอร์ม Modal ---
    if (i.isModalSubmit()) {
        if (i.customId === 'verify_modal') {
            const nickname = i.fields.getTextInputValue('v_name').trim();
            const age = i.fields.getTextInputValue('v_age').trim();
            const gender = i.fields.getTextInputValue('v_gender').trim();

            if (!verifyRoles.member) return i.reply({ content: '⚠️ ซีม่อนยังไม่ได้ตั้งค่ายศยืนยันตัวตนเลยค่ะ ให้ซีม่อนพิมพ์ /setup-verify ก่อนน้า', ephemeral: true });

            try {
                const member = i.member;
                // ให้ยศสมาชิกหลัก
                await member.roles.add(verifyRoles.member);

                // เช็คเพศแล้วให้ยศเพิ่ม
                let assignedText = '';
                if (gender === 'ชาย' || gender.toLowerCase() === 'male' || gender === 'ผู้ชาย') {
                    if (verifyRoles.male) await member.roles.add(verifyRoles.male);
                    assignedText = 'และมอบ **ยศผู้ชาย 👨** ';
                } else if (gender === 'หญิง' || gender.toLowerCase() === 'female' || gender === 'ผู้หญิง') {
                    if (verifyRoles.female) await member.roles.add(verifyRoles.female);
                    assignedText = 'และมอบ **ยศผู้หญิง 👩** ';
                }

                // แอบเปลี่ยนชื่อในเซิร์ฟเวอร์ให้เป็น [อายุ] ชื่อเล่น
                await member.setNickname(`[${age}] ${nickname}`).catch(() => null);

                await i.reply({ 
                    content: `🎉 ยินดีต้อนรับคุณ **${nickname}** (อายุ ${age}) เข้าสู่เซิร์ฟเวอร์ค่ะ!\nปายได้มอบยศสมาชิก ${assignedText}ให้เรียบร้อยแล้วน้าา 💖 ขอให้สนุกนะคะ!`, 
                    ephemeral: true 
                });

            } catch (error) {
                console.error(error);
                await i.reply({ content: '❌ ปายไม่สามารถมอบยศหรือเปลี่ยนชื่อให้ได้ค่ะ ฝากแจ้งซีม่อนให้เลื่อนยศบอทขึ้นหน่อยน้า 🥺', ephemeral: true });
            }
        }
    }
});

client.login(TOKEN);
