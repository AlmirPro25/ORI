/**
 * Script para instalar addons padrão brasileiros
 */

const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function installDefaultAddons() {
    console.log('🇧🇷 Instalando addons brasileiros padrão...\n');

    const addonsFile = path.join(__dirname, 'data', 'default-addons.json');
    const addons = JSON.parse(fs.readFileSync(addonsFile, 'utf8'));

    for (const addon of addons) {
        try {
            // Verificar se já existe
            const existing = await prisma.addon.findUnique({
                where: { manifestUrl: addon.manifestUrl }
            });

            if (existing) {
                console.log(`⏩ ${addon.name} já instalado`);
                continue;
            }

            // Buscar manifesto
            console.log(`📥 Instalando ${addon.name}...`);
            const response = await axios.get(addon.manifestUrl, { timeout: 10000 });
            const manifest = response.data;

            // Salvar no banco
            await prisma.addon.create({
                data: {
                    manifestUrl: addon.manifestUrl,
                    name: manifest.name || addon.name,
                    description: manifest.description || addon.description,
                    version: manifest.version || '1.0.0',
                    types: manifest.types ? JSON.stringify(manifest.types) : null,
                    resources: manifest.resources ? JSON.stringify(manifest.resources.map(r => typeof r === 'string' ? r : r.name)) : null,
                    enabled: addon.enabled
                }
            });

            console.log(`✅ ${addon.name} instalado com sucesso!`);
        } catch (error) {
            console.error(`❌ Erro ao instalar ${addon.name}:`, error.message);
        }
    }

    console.log('\n🎉 Instalação concluída!');
    await prisma.$disconnect();
}

installDefaultAddons().catch(console.error);
