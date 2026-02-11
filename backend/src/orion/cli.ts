#!/usr/bin/env node
import axios from 'axios';
import readline from 'readline';

const API_URL = 'http://localhost:3000/api/v1/orion';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.clear();
console.log(`
  🌌 ORION PROTOCOL CLI v1.0
  ==========================
  Comandos disponíveis:
  
  status       - Ver status do nó local
  peers        - Listar peers conectados
  connect <ip> - Conectar manualmente a um peer
  help         - Mostrar ajuda
  exit         - Sair
`);

const prompt = () => {
    rl.question('orion> ', async (cmd) => {
        const [command, ...args] = cmd.trim().split(' ');

        try {
            switch (command) {
                case 'status':
                    const { data: status } = await axios.get(`${API_URL}/status`);
                    console.table(status);
                    break;

                case 'peers':
                    const { data: peers } = await axios.get(`${API_URL}/peers`);
                    console.table(peers);
                    break;

                case 'connect':
                    if (!args[0]) {
                        console.log('❌ Uso: connect <ip_ou_url>');
                        break;
                    }
                    const manualTarget = args[0];
                    console.log(`🔭 Tentando conectar a ${manualTarget}...`);
                    // Simular um hello manual via CLI (na prática o nó faria isso)
                    // Aqui vamos chamar o endpoint de hello do nó LOCAL, instruindo ele a adicionar o peer
                    // Mas o endpoint hello espera receber hello DO peer, não comando para adicionar.
                    // Vamos adicionar um endpoint de debug para "addPeer" manual ou usar o hello com payload específico?
                    // Melhor: criar endpoint de comando no orion routes se fosse sério.
                    // Hack: chamar hello fingindo ser o peer, mas isso exige saber o ID dele.
                    // Vamos apenas listar por enquanto.
                    console.log('⚠️ Comando manual não implementado na CLI pública ainda.');
                    break;

                case 'exit':
                    process.exit(0);
                    break;

                case 'help':
                default:
                    console.log(`
  status       - Ver status do nó local
  peers        - Listar peers conectados
  exit         - Sair
                    `);
                    break;
            }
        } catch (error: any) {
            console.error('Erro:', error.message);
        }

        prompt();
    });
};

prompt();
