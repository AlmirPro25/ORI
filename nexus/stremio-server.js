#!/usr/bin/env node

/**
 * NEXUS STREMIO ADDON SERVER - VERSÃO REFINADA
 * Servidor standalone para o addon Stremio com recursos avançados
 */

const { serveAddon } = require('./stremio-addon-refined');

// Porta do servidor (pode ser configurada via variável de ambiente)
const PORT = process.env.ADDON_PORT || 7000;

// Iniciar servidor
serveAddon(PORT);
