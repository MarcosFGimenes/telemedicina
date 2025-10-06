import axios from 'axios';


export const asaas = axios.create({
baseURL: process.env.ASAAS_API_URL,
timeout: 20000,
});


asaas.interceptors.request.use((config) => {
config.headers = {
...config.headers,
'Content-Type': 'application/json',
// Header correto exigido pelo Asaas
		// Algumas vezes o provider espera o token prefixado por '$'.
		// O .env.local pode ser salvo sem o '$' e nós iremos adicionar aqui.
		access_token: `$${process.env.ASAAS_API_KEY!}`,
};
return config;
});