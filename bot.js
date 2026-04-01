require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    Collection,
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActivityType,
    Routes,
    REST,
    Events
} = require('discord.js');
const express = require('express');

// ==================== CONFIGURACIÓN ====================
const CONFIG = {
    CANAL_BIENVENIDA_ID: '1327127715572224066',
    ROLES_AUTOMATICOS_ID: [
        '1327127715517694001',
        '662750236304736256'
    ],
    ROL_AUTORIZADO: 'Management',
    ROL_MODERACION: '➻ DISCORD MOD'
};

const COLORS = {
    SUCCESS: 0x2ECC71,
    ERROR: 0xE74C3C,
    WARNING: 0xE67E22,
    INFO: 0x5865F2,
    TIMEOUT: 0xF39C12
};

const FOOTER_TEXT_ADMIN = 'EcuaCraft Network • Sistema Administrativo Oficial';
const FOOTER_TEXT_MOD = 'EcuaCraft Network • Sistema de Moderación Oficial';

// ==================== CLIENTE ====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

client.commands = new Collection();
client.cooldowns = new Collection();

// ==================== UTILIDADES ====================
function tieneRolAutorizado(member) {
    return member.roles.cache.some(role => role.name === CONFIG.ROL_AUTORIZADO);
}

function tieneRolModeracion(member) {
    return member.roles.cache.some(role => role.name === CONFIG.ROL_MODERACION);
}

function tienePermisoModeracion(member) {
    return member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
           member.roles.cache.some(role => role.name === CONFIG.ROL_MODERACION);
}

function tienePermisoGestionRoles(member) {
    return member.permissions.has(PermissionFlagsBits.ManageRoles);
}

function tienePermisoExpulsar(member) {
    return member.permissions.has(PermissionFlagsBits.KickMembers);
}

function tienePermisoGestionMensajes(member) {
    return member.permissions.has(PermissionFlagsBits.ManageMessages);
}

function createWelcomeEmbed(member, roles) {
    return new EmbedBuilder()
        .setTitle('📢 ¡TE DAMOS LA BIENVENIDA AL STAFF DE ECUACRAFT NETWORK!')
        .setDescription(
            `🎉 Bienvenido/a **${member.displayName}** (${member}), te damos la más cálida acogida.\n\n` +
            `👤 Por favor sé paciente mientras los HighStaff te hacen el ingreso.`
        )
        .setColor(COLORS.SUCCESS)
        .setThumbnail(member.displayAvatarURL({ dynamic: true }))
        .setAuthor({ 
            name: member.user.username, 
            iconURL: member.displayAvatarURL({ dynamic: true }) 
        })
        .setFooter({ text: FOOTER_TEXT_ADMIN })
        .setTimestamp();
}

// ==================== COMANDOS ====================
const commands = [];

// Ping
const pingCommand = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('🏓 Verificar latencia del bot'),
    cooldown: 5,
    async execute(interaction) {
        const sent = await interaction.reply({ 
            content: 'Calculando...', 
            fetchReply: true 
        });
        
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        const wsLatency = Math.round(client.ws.ping);

        await interaction.editReply(
            `🏓 Pong!\n` +
            `📡 Latencia API: ${latency}ms\n` +
            `💓 Latencia WebSocket: ${wsLatency}ms`
        );
    }
};
commands.push(pingCommand);

// Anuncio
const anuncioCommand = {
    data: new SlashCommandBuilder()
        .setName('anuncio')
        .setDescription('📢 Publica un anuncio oficial de EcuaCraft Network')
        .addStringOption(option =>
            option.setName('mensaje')
                .setDescription('Mensaje del anuncio')
                .setRequired(true))
        .addAttachmentOption(option =>
            option.setName('imagen')
                .setDescription('Imagen opcional para el anuncio')
                .setRequired(false)),
    cooldown: 5,
    async execute(interaction) {
        if (!tieneRolAutorizado(interaction.member)) {
            return interaction.reply({ 
                embeds: [{
                    title: '⛔ ACCESO DENEGADO',
                    description: 'No tienes permiso para usar este comando.',
                    color: COLORS.ERROR
                }], 
                ephemeral: true 
            });
        }

        const mensaje = interaction.options.getString('mensaje');
        const imagen = interaction.options.getAttachment('imagen');

        const embed = new EmbedBuilder()
            .setTitle('**📢 Anuncio Oficial de EcuaCraft Network**')
            .setDescription(mensaje)
            .setColor(COLORS.INFO)
            .setFooter({ 
                text: `➡️ Anuncio emitido por: ${interaction.member.displayName}.` 
            })
            .setTimestamp();

        if (imagen && imagen.contentType?.startsWith('image/')) {
            embed.setImage(imagen.url);
        }

        // Mensaje normal al canal, sin referencia al comando
        await interaction.channel.send({
            content: '||@everyone||',
            embeds: [embed],
            allowedMentions: { parse: ['everyone'] }
        });
        
        // Confirmación ephemeral al usuario
        await interaction.reply({ content: '✅ Anuncio publicado', ephemeral: true });
    }
};
commands.push(anuncioCommand);

// Promote
const promoteCommand = {
    data: new SlashCommandBuilder()
        .setName('promote')
        .setDescription('📈 Ascender a un miembro del staff')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a ascender')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('rango_inicial')
                .setDescription('Rango actual')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('rango_final')
                .setDescription('Nuevo rango')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('Motivo del ascenso')
                .setRequired(true)),
    cooldown: 3,
    async execute(interaction) {
        if (!tieneRolAutorizado(interaction.member)) {
            return interaction.reply({ 
                content: '⛔ No tienes permiso para usar este comando.', 
                ephemeral: true 
            });
        }

        const usuario = interaction.options.getMember('usuario');
        const rangoInicial = interaction.options.getString('rango_inicial');
        const rangoFinal = interaction.options.getString('rango_final');
        const motivo = interaction.options.getString('motivo');

        if (!usuario) {
            return interaction.reply({ 
                content: '❌ No se encontró al usuario especificado.', 
                ephemeral: true 
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('📢 ANUNCIO DE ASCENSO')
            .setDescription(
                `🎉 ¡Felicidades, **${usuario.displayName}** (${usuario}), ` +
                `has sido **ascendido**!\n\n` +
                `🔻 **De:** ${rangoInicial}\n` +
                `🔺 **A:** ${rangoFinal}\n` +
                `❓ **Motivo:** ${motivo}\n\n` +
                `[👤] Realizado por: **${interaction.member.displayName}**.\n\n` +
                `💫 El equipo de **EcuaCraft Network** confía en ti.`
            )
            .setColor(COLORS.SUCCESS)
            .setFooter({ text: FOOTER_TEXT_ADMIN })
            .setTimestamp();

        // Mensaje normal al canal
        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ Ascenso anunciado', ephemeral: true });
    }
};
commands.push(promoteCommand);

// Demote
const demoteCommand = {
    data: new SlashCommandBuilder()
        .setName('demote')
        .setDescription('🔴 Remover y expulsar a un miembro del staff')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a remover')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('Motivo del demoteo')
                .setRequired(true)),
    cooldown: 3,
    async execute(interaction) {
        if (!tieneRolAutorizado(interaction.member)) {
            return interaction.reply({ 
                content: '⛔ No tienes permiso para usar este comando.', 
                ephemeral: true 
            });
        }

        if (!tienePermisoExpulsar(interaction.member)) {
            return interaction.reply({ 
                content: '❌ Necesitas permiso de expulsar miembros.', 
                ephemeral: true 
            });
        }

        const usuario = interaction.options.getMember('usuario');
        const motivo = interaction.options.getString('motivo');

        if (!usuario) {
            return interaction.reply({ 
                content: '❌ No se encontró al usuario especificado.', 
                ephemeral: true 
            });
        }

        if (usuario.roles.highest.position >= interaction.member.roles.highest.position) {
            return interaction.reply({ 
                content: '❌ No puedes demotear a alguien con un rol igual o superior al tuyo.', 
                ephemeral: true 
            });
        }

        try {
            await usuario.kick(`Demote | ${motivo} | Por: ${interaction.user.tag}`);

            const embed = new EmbedBuilder()
                .setTitle('📢 ANUNCIO DE DEMOTEO')
                .setDescription(
                    `⚠️ **${usuario.displayName}** (${usuario}) ` +
                    `ha sido **demoteado y expulsado**.\n\n` +
                    `❓ Motivo: ${motivo}\n\n` +
                    `[👤] Realizado por: **${interaction.member.displayName}**.`
                )
                .setColor(COLORS.ERROR)
                .setFooter({ text: FOOTER_TEXT_ADMIN })
                .setTimestamp();

            // Mensaje normal al canal
            await interaction.channel.send({ embeds: [embed] });
            await interaction.reply({ content: '✅ Usuario demoteado y expulsado', ephemeral: true });

        } catch (error) {
            console.error('Error en demote:', error);
            await interaction.reply({ 
                content: '❌ No se pudo expulsar al usuario. Verifica los permisos.', 
                ephemeral: true 
            });
        }
    }
};
commands.push(demoteCommand);

// Degrado
const degradoCommand = {
    data: new SlashCommandBuilder()
        .setName('degrado')
        .setDescription('🟠 Degradar a un miembro del staff')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a degradar')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('rango_inicial')
                .setDescription('Rango actual')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('rango_final')
                .setDescription('Nuevo rango')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('Motivo del degrado')
                .setRequired(true)),
    cooldown: 3,
    async execute(interaction) {
        if (!tieneRolAutorizado(interaction.member)) {
            return interaction.reply({ 
                content: '⛔ No tienes permiso para usar este comando.', 
                ephemeral: true 
            });
        }

        const usuario = interaction.options.getMember('usuario');
        const rangoInicial = interaction.options.getString('rango_inicial');
        const rangoFinal = interaction.options.getString('rango_final');
        const motivo = interaction.options.getString('motivo');

        if (!usuario) {
            return interaction.reply({ 
                content: '❌ No se encontró al usuario especificado.', 
                ephemeral: true 
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('📢 ANUNCIO DE DEGRADO')
            .setDescription(
                `⚠️ ¡Staff **${usuario.displayName}** (${usuario}), ` +
                `ha sido **degradado**!\n\n` +
                `🔻 **De:** ${rangoInicial}\n` +
                `🔺 **A:** ${rangoFinal}\n` +
                `❓ **Motivo:** ${motivo}\n\n` +
                `[👤] Realizado por: **${interaction.member.displayName}**.\n\n` +
                `📌 Decisión del equipo **EcuaCraft Network**.`
            )
            .setColor(COLORS.WARNING)
            .setFooter({ text: FOOTER_TEXT_ADMIN })
            .setTimestamp();

        // Mensaje normal al canal
        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ Degrado anunciado', ephemeral: true });
    }
};
commands.push(degradoCommand);

// Strike
const strikeCommand = {
    data: new SlashCommandBuilder()
        .setName('strike')
        .setDescription('⚠️ Emitir un strike disciplinario')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a sancionar')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('Motivo del strike')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('numero')
                .setDescription('Número de strike (ej: 1/2, 2/3)')
                .setRequired(true)),
    cooldown: 3,
    async execute(interaction) {
        if (!tieneRolAutorizado(interaction.member)) {
            return interaction.reply({ 
                content: '⛔ No tienes permiso para usar este comando.', 
                ephemeral: true 
            });
        }

        const usuario = interaction.options.getMember('usuario');
        const motivo = interaction.options.getString('motivo');
        const numeroStrike = interaction.options.getString('numero');

        if (!usuario) {
            return interaction.reply({ 
                content: '❌ No se encontró al usuario especificado.', 
                ephemeral: true 
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('📢 STRIKE')
            .setDescription(
                `🔤 Nick: ${usuario.displayName} (${usuario}).\n` +
                `❓ Motivo: ${motivo}.\n` +
                `⚠️ Strike: ${numeroStrike}.\n\n` +
                `[👤] Realizado por: **${interaction.member.displayName}**.\n\n` +
                `📌 Decisión del equipo **EcuaCraft Network**.`
            )
            .setColor(COLORS.ERROR)
            .setFooter({ text: FOOTER_TEXT_ADMIN })
            .setTimestamp();

        // Mensaje normal al canal
        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ Strike emitido', ephemeral: true });
    }
};
commands.push(strikeCommand);

// Warn
const warnCommand = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('🚨 Emitir una advertencia disciplinaria')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a advertir')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('Motivo de la advertencia')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('sancion')
                .setDescription('Sanción aplicada')
                .setRequired(true)),
    cooldown: 3,
    async execute(interaction) {
        if (!tieneRolAutorizado(interaction.member)) {
            return interaction.reply({ 
                content: '⛔ No tienes permiso para usar este comando.', 
                ephemeral: true 
            });
        }

        const usuario = interaction.options.getMember('usuario');
        const motivo = interaction.options.getString('motivo');
        const sancion = interaction.options.getString('sancion');

        if (!usuario) {
            return interaction.reply({ 
                content: '❌ No se encontró al usuario especificado.', 
                ephemeral: true 
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('📢 ADVERTENCIA')
            .setDescription(
                `🔤 Nick: ${usuario.displayName} (${usuario}).\n` +
                `❓ Motivo: ${motivo}.\n` +
                `⚠️ Sanción: ${sancion}.\n\n` +
                `[👤] Realizado por: **${interaction.member.displayName}**.\n\n` +
                `📌 Decisión del equipo **EcuaCraft Network**.`
            )
            .setColor(COLORS.WARNING)
            .setFooter({ text: FOOTER_TEXT_ADMIN })
            .setTimestamp();

        // Mensaje normal al canal
        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ Advertencia emitida', ephemeral: true });
    }
};
commands.push(warnCommand);

// Addrol
const addrolCommand = {
    data: new SlashCommandBuilder()
        .setName('addrol')
        .setDescription('➕ Asignar un rol a un usuario')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario al que asignar el rol')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('rol')
                .setDescription('Rol a asignar')
                .setRequired(true)),
    cooldown: 3,
    async execute(interaction) {
        if (!tieneRolAutorizado(interaction.member)) {
            return interaction.reply({ 
                content: '⛔ No tienes permiso para usar este comando.', 
                ephemeral: true 
            });
        }

        if (!tienePermisoGestionRoles(interaction.member)) {
            return interaction.reply({ 
                content: '❌ Necesitas permiso de gestionar roles.', 
                ephemeral: true 
            });
        }

        const miembro = interaction.options.getMember('usuario');
        const rol = interaction.options.getRole('rol');

        if (!miembro) {
            return interaction.reply({ 
                content: '❌ No se encontró al usuario especificado.', 
                ephemeral: true 
            });
        }

        if (rol.position >= interaction.member.roles.highest.position) {
            return interaction.reply({ 
                content: '❌ No puedes asignar un rol igual o superior al tuyo.', 
                ephemeral: true 
            });
        }

        if (rol.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({ 
                content: '❌ No tengo permisos para asignar ese rol.', 
                ephemeral: true 
            });
        }

        if (miembro.roles.cache.has(rol.id)) {
            return interaction.reply({ 
                content: '⚠️ El usuario ya tiene ese rol.', 
                ephemeral: true 
            });
        }

        try {
            await miembro.roles.add(rol);

            const embed = new EmbedBuilder()
                .setTitle('✅ ROL ASIGNADO')
                .setDescription(
                    `👤 Staff: ${miembro.displayName} (${miembro})\n` +
                    `🏷️ Rol: **${rol.name}**\n\n` +
                    `📌 Asignado por: **${interaction.member.displayName}**.`
                )
                .setColor(COLORS.SUCCESS)
                .setThumbnail(miembro.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: FOOTER_TEXT_ADMIN })
                .setTimestamp();

            // Mensaje normal al canal
            await interaction.channel.send({ embeds: [embed] });
            await interaction.reply({ content: '✅ Rol asignado', ephemeral: true });

        } catch (error) {
            console.error('Error en addrol:', error);
            await interaction.reply({ 
                content: '❌ No se pudo asignar el rol.', 
                ephemeral: true 
            });
        }
    }
};
commands.push(addrolCommand);

// Delrol
const delrolCommand = {
    data: new SlashCommandBuilder()
        .setName('delrol')
        .setDescription('➖ Remover un rol de un usuario')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario al que remover el rol')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('rol')
                .setDescription('Rol a remover')
                .setRequired(true)),
    cooldown: 3,
    async execute(interaction) {
        if (!tieneRolAutorizado(interaction.member)) {
            return interaction.reply({ 
                content: '⛔ No tienes permiso para usar este comando.', 
                ephemeral: true 
            });
        }

        if (!tienePermisoGestionRoles(interaction.member)) {
            return interaction.reply({ 
                content: '❌ Necesitas permiso de gestionar roles.', 
                ephemeral: true 
            });
        }

        const miembro = interaction.options.getMember('usuario');
        const rol = interaction.options.getRole('rol');

        if (!miembro) {
            return interaction.reply({ 
                content: '❌ No se encontró al usuario especificado.', 
                ephemeral: true 
            });
        }

        if (rol.position >= interaction.member.roles.highest.position) {
            return interaction.reply({ 
                content: '❌ No puedes quitar un rol igual o superior al tuyo.', 
                ephemeral: true 
            });
        }

        if (rol.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({ 
                content: '❌ No tengo permisos para quitar ese rol.', 
                ephemeral: true 
            });
        }

        if (!miembro.roles.cache.has(rol.id)) {
            return interaction.reply({ 
                content: '⚠️ El usuario no tiene ese rol.', 
                ephemeral: true 
            });
        }

        try {
            await miembro.roles.remove(rol);

            const embed = new EmbedBuilder()
                .setTitle('❌ ROL REMOVIDO')
                .setDescription(
                    `👤 Staff: ${miembro.displayName} (${miembro})\n` +
                    `🏷️ Rol removido: **${rol.name}**\n\n` +
                    `📌 Removido por: **${interaction.member.displayName}**.`
                )
                .setColor(COLORS.ERROR)
                .setThumbnail(miembro.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: FOOTER_TEXT_ADMIN })
                .setTimestamp();

            // Mensaje normal al canal
            await interaction.channel.send({ embeds: [embed] });
            await interaction.reply({ content: '✅ Rol removido', ephemeral: true });

        } catch (error) {
            console.error('Error en delrol:', error);
            await interaction.reply({ 
                content: '❌ No se pudo remover el rol.', 
                ephemeral: true 
            });
        }
    }
};
commands.push(delrolCommand);

// Clear
const clearCommand = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('🧹 Eliminar mensajes del canal')
        .addIntegerOption(option =>
            option.setName('cantidad')
                .setDescription('Cantidad de mensajes a eliminar (máx. 150)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(150)),
    cooldown: 5,
    async execute(interaction) {
        if (!tieneRolAutorizado(interaction.member)) {
            return interaction.reply({ 
                content: '⛔ No tienes permiso para usar este comando.', 
                ephemeral: true 
            });
        }

        if (!tienePermisoGestionMensajes(interaction.member)) {
            return interaction.reply({ 
                content: '❌ Necesitas permiso de gestionar mensajes.', 
                ephemeral: true 
            });
        }

        const cantidad = interaction.options.getInteger('cantidad');

        await interaction.deferReply({ ephemeral: true });

        try {
            const mensajes = await interaction.channel.bulkDelete(cantidad, true);
            
            const embed = new EmbedBuilder()
                .setTitle('🧹 MENSAJES ELIMINADOS')
                .setDescription(
                    `🗑️ **Mensajes borrados:** ${mensajes.size}\n` +
                    `📍 **Canal:** ${interaction.channel}\n\n` +
                    `[❗] Realizado por: **${interaction.member.displayName}**`
                )
                .setColor(COLORS.ERROR)
                .setFooter({ text: FOOTER_TEXT_ADMIN })
                .setTimestamp();

            // Mensaje normal al canal
            const publicMsg = await interaction.channel.send({ embeds: [embed] });
            
            await interaction.editReply({ content: `✅ ${mensajes.size} mensajes eliminados.` });

            setTimeout(() => {
                publicMsg.delete().catch(() => {});
            }, 10000);

        } catch (error) {
            console.error('Error en clear:', error);
            await interaction.editReply({ 
                content: '❌ No se pudieron eliminar los mensajes. Verifica que los mensajes tengan menos de 14 días de antigüedad.' 
            });
        }
    }
};
commands.push(clearCommand);

// Guia
const guiaCommand = {
    data: new SlashCommandBuilder()
        .setName('guia')
        .setDescription('📖 Guía de comandos administrativos'),
    cooldown: 10,
    async execute(interaction) {
        if (!tieneRolAutorizado(interaction.member)) {
            return interaction.reply({ 
                content: '⛔ No tienes permiso para usar este comando.', 
                ephemeral: true 
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('📣 CENTRO DE COMANDOS — ECUACRAFT STAFF')
            .setDescription(
                'Bienvenido al **Sistema Administrativo de EcuaCraft Network**.\n\n' +
                'Aquí encontrarás la guía oficial para utilizar correctamente ' +
                'los comandos de **gestión de staff**.\n\n' +
                '🔐 *Acceso exclusivo para el HighStaff.*'
            )
            .setColor(COLORS.INFO);

        const fields = [
            {
                name: '🟢 ASCENSOS — `/promote`',
                value: 
                    '📌 **Descripción:**\n' +
                    'Asciende a un miembro del staff.\n' +
                    '🧾 **Formato:**\n' +
                    '`/promote <@usuario> <rango_inicial> <rango_final> <motivo>`\n' +
                    '✏️ **Ejemplo:**\n' +
                    '`/promote @MrOsorio MOD MOD_GLOBAL Buen desempeño`',
                inline: false
            },
            {
                name: '🔴 DEMOTEO — `/demote`',
                value: 
                    '📌 **Descripción:** Remueve a un miembro del staff.\n' +
                    '🧾 **Formato:**\n' +
                    '`/demote <@usuario> <motivo>`\n' +
                    '✏️ **Ejemplo:**\n' +
                    '`/demote @MrOsorio Inactividad prolongada`',
                inline: false
            },
            {
                name: '🟠 DEGRADOS — `/degrado`',
                value: 
                    '📌 **Descripción:**\n' +
                    'Reduce el rango de un miembro del staff.\n' +
                    '🧾 **Formato:**\n' +
                    '`/degrado <@usuario> <rango_inicial> <rango_final> <motivo>`\n' +
                    '✏️ **Ejemplo:**\n' +
                    '`/degrado @MrOsorio ADMIN MOD Inactividad`',
                inline: false
            },
            {
                name: '⚠️ ADVERTENCIAS — `/warn`',
                value: 
                    '📌 **Descripción:**\n' +
                    'Emite una advertencia disciplinaria.\n' +
                    '🧾 **Formato:**\n' +
                    '`/warn <@usuario> <motivo> <sancion>`\n' +
                    '✏️ **Ejemplo:**\n' +
                    '`/warn @MrOsorio Lenguaje Mute_24h`',
                inline: false
            },
            {
                name: '⚠️ STRIKES — `/strike`',
                value: 
                    '📌 **Descripción:**\n' +
                    'Emite un strike disciplinario.\n' +
                    '🧾 **Formato:**\n' +
                    '`/strike <@usuario> <motivo> <numero_de_strike>`\n' +
                    '✏️ **Ejemplo:**\n' +
                    '`/strike @MrOsorio Lenguaje 1/2`',
                inline: false
            },
            {
                name: '✅ AÑADIR ROLES — `/addrol`',
                value: 
                    '📌 **Descripción:**\n' +
                    'Agrégale cualquier rol a un usuario.\n' +
                    '🧾 **Formato:**\n' +
                    '`/addrol <@usuario> <rol>`\n' +
                    '✏️ **Ejemplo:**\n' +
                    '`/addrol @MrOsorio ADMIN`',
                inline: false
            },
            {
                name: '❌ REMOVER ROLES — `/delrol`',
                value: 
                    '📌 **Descripción:**\n' +
                    'Remueve cualquier rol a un usuario.\n' +
                    '🧾 **Formato:**\n' +
                    '`/delrol <@usuario> <rol>`\n' +
                    '✏️ **Ejemplo:**\n' +
                    '`/delrol @MrOsorio ADMIN`',
                inline: false
            },
            {
                name: '🧹 LIMPIAR CHAT — `/clear`',
                value: 
                    '📌 **Descripción:**\n' +
                    'Elimina mensajes del canal.\n' +
                    '🧾 **Formato:**\n' +
                    '`/clear <cantidad>` (máx. 150)\n' +
                    '✏️ **Ejemplo:**\n' +
                    '`/clear 50`',
                inline: false
            },
            {
                name: 'ℹ️ IMPORTANTE',
                value: 
                    '• Todos los comandos generan **anuncios oficiales**.\n' +
                    '• El mal uso será sancionado.\n' +
                    '• Usa siempre motivos claros y justificados.\n\n' +
                    '*Created by: MrOsorio*',
                inline: false
            }
        ];

        embed.addFields(fields);
        embed.setFooter({ text: FOOTER_TEXT_ADMIN });

        // Mensaje normal al canal
        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ Guía enviada', ephemeral: true });
    }
};
commands.push(guiaCommand);

// Mute
const muteCommand = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('🔇 Silenciar a un usuario indefinidamente (28 días máx.)')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a silenciar')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('Motivo del mute')
                .setRequired(false)),
    cooldown: 3,
    async execute(interaction) {
        if (!tienePermisoModeracion(interaction.member)) {
            return interaction.reply({ 
                content: '⛔ No tienes permiso para usar este comando.', 
                ephemeral: true 
            });
        }

        const miembro = interaction.options.getMember('usuario');
        const motivo = interaction.options.getString('motivo') || 'No especificado';

        if (!miembro) {
            return interaction.reply({ 
                content: '❌ No se encontró al usuario especificado.', 
                ephemeral: true 
            });
        }

        if (miembro.isCommunicationDisabled()) {
            return interaction.reply({ 
                content: '⚠️ El usuario ya está muteado.', 
                ephemeral: true 
            });
        }

        if (miembro.roles.highest.position >= interaction.member.roles.highest.position) {
            return interaction.reply({ 
                content: '❌ No puedes mutear a alguien con un rol igual o superior al tuyo.', 
                ephemeral: true 
            });
        }

        try {
            const duracion = 28 * 24 * 60 * 60 * 1000;
            await miembro.timeout(duracion, motivo);

            const embed = new EmbedBuilder()
                .setTitle('🔇 USUARIO MUTEADO')
                .setDescription(
                    `👤 Usuario: ${miembro}\n` +
                    `📛 Nombre: **${miembro.displayName}**\n` +
                    `❓ Motivo: ${motivo}\n\n` +
                    `[❗] Realizado por: **${interaction.member.displayName}**.`
                )
                .setColor(COLORS.ERROR)
                .setFooter({ text: FOOTER_TEXT_MOD })
                .setTimestamp();

            // Mensaje normal al canal
            await interaction.channel.send({ embeds: [embed] });
            await interaction.reply({ content: '✅ Usuario muteado', ephemeral: true });

        } catch (error) {
            console.error('Error en mute:', error);
            await interaction.reply({ 
                content: '❌ No se pudo mutear al usuario. Verifica los permisos.', 
                ephemeral: true 
            });
        }
    }
};
commands.push(muteCommand);

// Tempmute
const tempmuteCommand = {
    data: new SlashCommandBuilder()
        .setName('tempmute')
        .setDescription('⏱️ Silenciar a un usuario temporalmente')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a silenciar')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('tiempo')
                .setDescription('Cantidad de tiempo')
                .setRequired(true)
                .setMinValue(1))
        .addStringOption(option =>
            option.setName('unidad')
                .setDescription('Unidad de tiempo')
                .setRequired(true)
                .addChoices(
                    { name: 'Minutos', value: 'm' },
                    { name: 'Horas', value: 'h' },
                    { name: 'Días', value: 'd' }
                ))
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('Motivo del mute')
                .setRequired(false)),
    cooldown: 3,
    async execute(interaction) {
        if (!tienePermisoModeracion(interaction.member)) {
            return interaction.reply({ 
                content: '⛔ No tienes permiso para usar este comando.', 
                ephemeral: true 
            });
        }

        const miembro = interaction.options.getMember('usuario');
        const tiempo = interaction.options.getInteger('tiempo');
        const unidad = interaction.options.getString('unidad');
        const motivo = interaction.options.getString('motivo') || 'No especificado';

        if (!miembro) {
            return interaction.reply({ 
                content: '❌ No se encontró al usuario especificado.', 
                ephemeral: true 
            });
        }

        if (miembro.roles.highest.position >= interaction.member.roles.highest.position) {
            return interaction.reply({ 
                content: '❌ No puedes mutear a alguien con un rol igual o superior al tuyo.', 
                ephemeral: true 
            });
        }

        const unidades = {
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000
        };

        const duracionMs = tiempo * unidades[unidad];
        const maxTimeout = 28 * 24 * 60 * 60 * 1000;

        if (duracionMs > maxTimeout) {
            return interaction.reply({ 
                content: '❌ El tiempo máximo de mute es 28 días.', 
                ephemeral: true 
            });
        }

        try {
            await miembro.timeout(duracionMs, motivo);

            const embed = new EmbedBuilder()
                .setTitle('⏱️ USUARIO TEMP-MUTEADO')
                .setDescription(
                    `👤 Usuario: ${miembro}\n` +
                    `📛 Nombre: **${miembro.displayName}**\n` +
                    `⏳ Tiempo: ${tiempo}${unidad}\n` +
                    `❓ Motivo: ${motivo}\n\n` +
                    `[❗] Realizado por: **${interaction.member.displayName}**.`
                )
                .setColor(COLORS.TIMEOUT)
                .setFooter({ text: FOOTER_TEXT_MOD })
                .setTimestamp();

            // Mensaje normal al canal
            await interaction.channel.send({ embeds: [embed] });
            await interaction.reply({ content: '✅ Usuario temp-muteado', ephemeral: true });

        } catch (error) {
            console.error('Error en tempmute:', error);
            await interaction.reply({ 
                content: '❌ No se pudo mutear al usuario.', 
                ephemeral: true 
            });
        }
    }
};
commands.push(tempmuteCommand);

// Unmute
const unmuteCommand = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('🔊 Remover el silencio a un usuario')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a desmutear')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('Motivo del unmute')
                .setRequired(false)),
    cooldown: 3,
    async execute(interaction) {
        if (!tienePermisoModeracion(interaction.member)) {
            return interaction.reply({ 
                content: '⛔ No tienes permiso para usar este comando.', 
                ephemeral: true 
            });
        }

        const miembro = interaction.options.getMember('usuario');
        const motivo = interaction.options.getString('motivo') || 'Fin de sanción';

        if (!miembro) {
            return interaction.reply({ 
                content: '❌ No se encontró al usuario especificado.', 
                ephemeral: true 
            });
        }

        if (!miembro.isCommunicationDisabled()) {
            return interaction.reply({ 
                content: '⚠️ El usuario no está muteado.', 
                ephemeral: true 
            });
        }

        try {
            await miembro.timeout(null, motivo);

            const embed = new EmbedBuilder()
                .setTitle('🔊 UNMUTE APLICADO')
                .setDescription(
                    `👤 Usuario: ${miembro}\n` +
                    `📛 Nombre: **${miembro.displayName}**\n` +
                    `📝 Motivo: ${motivo}\n\n` +
                    `[❗] Realizado por: **${interaction.member.displayName}**.`
                )
                .setColor(COLORS.SUCCESS)
                .setFooter({ text: FOOTER_TEXT_MOD })
                .setTimestamp();

            // Mensaje normal al canal
            await interaction.channel.send({ embeds: [embed] });
            await interaction.reply({ content: '✅ Unmute aplicado', ephemeral: true });

        } catch (error) {
            console.error('Error en unmute:', error);
            await interaction.reply({ 
                content: '❌ No se pudo remover el mute.', 
                ephemeral: true 
            });
        }
    }
};
commands.push(unmuteCommand);

// Moderacion
const moderacionCommand = {
    data: new SlashCommandBuilder()
        .setName('moderacion')
        .setDescription('🛡️ Guía de comandos de moderación'),
    cooldown: 10,
    async execute(interaction) {
        if (!tienePermisoModeracion(interaction.member)) {
            return interaction.reply({ 
                content: '⛔ No tienes permiso para usar este comando.', 
                ephemeral: true 
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🛡️ GUÍA DE MODERACIÓN — ECUACRAFT NETWORK')
            .setDescription(
                'Bienvenido al **Centro de Moderación** de **EcuaCraft Network**.\n\n' +
                'Aquí encontrarás los comandos oficiales destinados al **control disciplinario** ' +
                'del servidor.\n\n' +
                '🔐 *Acceso exclusivo para el equipo de Moderación.*'
            )
            .setColor(COLORS.ERROR);

        const fields = [
            {
                name: '🔇 MUTE — `/mute`',
                value: 
                    '📌 **Descripción:**\n' +
                    'Silencia a un usuario de forma indefinida (28 días máx.).\n' +
                    '🧾 **Formato:**\n' +
                    '`/mute <@usuario> [motivo]`\n' +
                    '✏️ **Ejemplo:**\n' +
                    '`/mute @Usuario Spam en el chat`',
                inline: false
            },
            {
                name: '⏱️ TEMP-MUTE — `/tempmute`',
                value: 
                    '📌 **Descripción:**\n' +
                    'Silencia a un usuario por un tiempo determinado.\n' +
                    '🧾 **Formato:**\n' +
                    '`/tempmute <@usuario> <tiempo> <unidad> [motivo]`\n' +
                    '✏️ **Ejemplo:**\n' +
                    '`/tempmute @Usuario 15 m Flood`\n\n' +
                    '**Unidades:**\n' +
                    '• `m` = minutos\n' +
                    '• `h` = horas\n' +
                    '• `d` = días',
                inline: false
            },
            {
                name: '🔊 UNMUTE — `/unmute`',
                value: 
                    '📌 **Descripción:**\n' +
                    'Remueve el mute a un usuario.\n' +
                    '🧾 **Formato:**\n' +
                    '`/unmute <@usuario> [motivo]`\n' +
                    '✏️ **Ejemplo:**\n' +
                    '`/unmute @Usuario Testing`',
                inline: false
            },
            {
                name: 'ℹ️ IMPORTANTE',
                value: 
                    '• Todos los comandos generan **registros oficiales**.\n' +
                    '• El abuso de los comandos será sancionado.\n' +
                    '• Usa siempre un **motivo claro y justificado**.\n\n' +
                    '`Created by: MrOsorio`',
                inline: false
            }
        ];

        embed.addFields(fields);
        embed.setFooter({ text: FOOTER_TEXT_MOD });

        // Mensaje normal al canal
        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ Guía de moderación enviada', ephemeral: true });
    }
};
commands.push(moderacionCommand);

// ==================== REGISTRAR COMANDOS ====================
commands.forEach(cmd => {
    client.commands.set(cmd.data.name, cmd);
});

// ==================== EVENTOS ====================
client.once(Events.ClientReady, async () => {
    console.log(`✅ Conectado como ${client.user.tag} (ID: ${client.user.id})`);
    
    client.user.setPresence({
        activities: [{ 
            name: 'EcuaCraft Network • Managemnt System', 
            type: ActivityType.Watching 
        }],
        status: 'online'
    });

    // Deploy commands
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        
        console.log(`🚀 Iniciando deploy de ${commands.length} comandos...`);

        if (process.env.GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands.map(cmd => cmd.data.toJSON()) }
            );
            console.log('✅ Comandos deployados en servidor de desarrollo');
        } else {
            await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands.map(cmd => cmd.data.toJSON()) }
            );
            console.log('✅ Comandos deployados globalmente');
        }
    } catch (error) {
        console.error('❌ Error en deploy:', error);
    }
});

client.on(Events.GuildMemberAdd, async (member) => {
    try {
        const canal = member.guild.channels.cache.get(CONFIG.CANAL_BIENVENIDA_ID);
        
        const roles = [];
        for (const rolId of CONFIG.ROLES_AUTOMATICOS_ID) {
            const rol = member.guild.roles.cache.get(rolId);
            if (rol) {
                roles.push(rol);
            }
        }

        if (roles.length > 0) {
            await member.roles.add(roles);
            console.log(`✅ Roles asignados a ${member.user.tag}: ${roles.map(r => r.name).join(', ')}`);
        }

        if (canal) {
            const embed = createWelcomeEmbed(member, roles);
            await canal.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error('❌ Error en guildMemberAdd:', error);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`❌ Comando no encontrado: ${interaction.commandName}`);
        return;
    }

    try {
        // Cooldown check
        if (command.cooldown) {
            const { cooldowns } = client;
            
            if (!cooldowns.has(command.data.name)) {
                cooldowns.set(command.data.name, new Collection());
            }

            const now = Date.now();
            const timestamps = cooldowns.get(command.data.name);
            const cooldownAmount = command.cooldown * 1000;

            if (timestamps.has(interaction.user.id)) {
                const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

                if (now < expirationTime) {
                    const expiredTimestamp = Math.round(expirationTime / 1000);
                    return interaction.reply({ 
                        content: `⏳ Por favor espera, estás en cooldown. Podrás usar el comando de nuevo <t:${expiredTimestamp}:R>.`,
                        ephemeral: true 
                    });
                }
            }

            timestamps.set(interaction.user.id, now);
            setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
        }

        await command.execute(interaction);
        
    } catch (error) {
        console.error(`❌ Error ejecutando ${interaction.commandName}:`, error);
        
        const errorMessage = {
            content: '❌ Hubo un error al ejecutar este comando.',
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

// ==================== WEB SERVER ====================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        bot: client.user?.tag || 'Starting...',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

const server = app.listen(PORT, () => {
    console.log(`🌐 Web server activo en puerto ${PORT}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`⚠️ Puerto ${PORT} en uso, intentando con ${PORT + 1}...`);
        server.listen(PORT + 1);
    }
});

// ==================== INICIO ====================
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
    console.error('❌ ERROR: No se encontró DISCORD_TOKEN en el archivo .env');
    process.exit(1);
}

console.log('✅ Token cargado correctamente.');

client.login(DISCORD_TOKEN);

// Manejo de errores
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});