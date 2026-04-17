import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface Identity {
    nodeId: string;
    publicKey: string;
    privateKey: string;
}

export class IdentityManager {
    private identity: Identity | null = null;
    private readonly identityPath: string;

    constructor(storagePath: string = './orion-identity.json') {
        this.identityPath = path.resolve(storagePath);
    }

    /**
     * Carrega ou cria uma nova identidade para o nó.
     */
    public loadOrCreate(): Identity {
        if (fs.existsSync(this.identityPath)) {
            try {
                const data = fs.readFileSync(this.identityPath, 'utf-8');
                this.identity = JSON.parse(data);
                console.log(`🔐 [Orion Identity] Identidade carregada: ${this.identity?.nodeId}`);
            } catch (error) {
                console.error('❌ [Orion Identity] Erro ao carregar identidade, recriando...', error);
                this.identity = this.generateIdentity();
                this.saveIdentity();
            }
        } else {
            console.log('✨ [Orion Identity] Criando nova identidade...');
            this.identity = this.generateIdentity();
            this.saveIdentity();
        }

        return this.identity!;
    }

    /**
     * Gera um par de chaves e o Node ID.
     */
    private generateIdentity(): Identity {
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });

        // Node ID é o SHA-256 da chave pública (simplificado)
        const nodeId = crypto.createHash('sha256').update(publicKey).digest('hex').substring(0, 16);

        return {
            nodeId,
            publicKey,
            privateKey
        };
    }

    private saveIdentity() {
        if (!this.identity) return;
        fs.writeFileSync(this.identityPath, JSON.stringify(this.identity, null, 2));
        console.log(`💾 [Orion Identity] Salva em disco: ${this.identityPath}`);
    }

    public getIdentity(): Identity {
        if (!this.identity) {
            throw new Error('Identity not initialized. Call loadOrCreate() first.');
        }
        return this.identity;
    }

    public signMessage(message: string): string {
        if (!this.identity) throw new Error('No identity');
        const sign = crypto.createSign('SHA256');
        sign.update(message);
        sign.end();
        return sign.sign(this.identity.privateKey, 'base64');
    }

    public verifySignature(message: string, signature: string, publicKey: string): boolean {
        const verify = crypto.createVerify('SHA256');
        verify.update(message);
        verify.end();
        return verify.verify(publicKey, signature, 'base64');
    }
}
