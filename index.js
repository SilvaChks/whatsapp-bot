const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Configuração do cliente do WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(), // Salva a sessão localmente
  puppeteer: {
    headless: true, // Executa o navegador em modo headless
  },
});

let mensagem = null;
let intervaloMinutos = null;
let groupId = null;
let groupName = null; // Para armazenar o nome do grupo
let sentMessages = []; // Array para armazenar o relatório das mensagens enviadas

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Servir arquivos estáticos
app.use(express.static('public'));

// Gerar QR Code para autenticação
client.on('qr', (qr) => {
  io.emit('qr', qr); // Envia o QR code para o cliente web via socket
});

// Quando o bot estiver pronto (online)
client.on('ready', () => {
  console.log('Bot está pronto!');
  io.emit('status', 'online'); // Envia "online" para o frontend
});

// Quando o bot se desconectar
client.on('disconnected', () => {
  console.log('Bot desconectado!');
  io.emit('status', 'offline'); // Envia "offline" para o frontend
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Quando receber uma mensagem
client.on('message', async (msg) => {
  const texto = msg.body;

  if (msg.body === '/id') {
    try {
      const chat = await msg.getChat();
      console.log('Chat info:', chat);

      // Verifica se o chat é um grupo
      if (msg.from.endsWith('@g.us')) {
        msg.reply(`O ID deste grupo é: ${msg.from}`);
      } else {
        msg.reply('Este comando só funciona em grupos.');
      }
    } catch (error) {
      console.error('Erro ao processar o comando /id:', error);
      msg.reply('Ocorreu um erro ao processar o comando. Tente novamente.');
    }
  }
});

// Escutando o evento startBot do front-end
io.on('connection', (socket) => {
  socket.on('startBot', (config) => {
    mensagem = config.mensagem;
    intervaloMinutos = parseFloat(config.intervalo);
    groupId = config.groupId;

    // Verifica se o ID do grupo é válido
    if (!groupId.endsWith('@g.us')) {
      socket.emit('message', 'ID do grupo inválido. Certifique-se de que o ID termina com "@g.us".');
      return;
    }

    // Obtém o nome do grupo
    client.getChatById(groupId).then((chat) => {
      groupName = chat.name; // Armazena o nome do grupo
    }).catch((error) => {
      console.error('Erro ao obter o nome do grupo:', error);
      socket.emit('message', 'Não foi possível obter o nome do grupo.');
    });

    // Converte minutos para milissegundos
    const intervaloMilissegundos = intervaloMinutos * 60 * 1000;

    // Função para enviar a mensagem e registrar no relatório
    const enviarMensagem = async () => {
      try {
        const chat = await client.getChatById(groupId);
        if (chat) {
          await chat.sendMessage(mensagem);
          console.log(`Mensagem enviada: "${mensagem}"`);

          // Adiciona o relatório da mensagem enviada
          const dataHora = new Date().toLocaleString();
          sentMessages.push({
            mensagem: mensagem,
            dataHora: dataHora,
            groupName: groupName || 'Desconhecido',
            groupId: groupId,
          });

          // Envia o relatório das mensagens para o front-end
          io.emit('sentMessages', sentMessages);
        } else {
          console.error('Grupo não encontrado.');
        }
      } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
      }
    };

    // Envia a primeira mensagem imediatamente
    enviarMensagem();

    // Configura o intervalo para enviar a mensagem repetidamente
    setInterval(enviarMensagem, intervaloMilissegundos);

    socket.emit('message', `Bot iniciado. Mensagens serão enviadas a cada ${intervaloMinutos} minutos.`);
  });
});

// Iniciar o cliente
client.initialize();

// Rota para a aplicação web
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Iniciar o servidor HTTP
server.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});
