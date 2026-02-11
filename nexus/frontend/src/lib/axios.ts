import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:3000/api',
    timeout: 60000,
    headers: {
        'Content-Type': 'application/json',
        'X-Client-Version': 'NEXUS-V3.0',
    },
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        let msg = 'FALHA NA REDE NEURAL';
        if (error.response) msg = error.response.data.error || `ERRO ${error.response.status}`;
        else if (error.request) msg = 'SERVIDOR INACESSÍVEL - ARCONTE OFFLINE';
        return Promise.reject(new Error(msg));
    }
);

export { api };
