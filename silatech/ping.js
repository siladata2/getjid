module.exports = {
  name: 'ping',
  alias: ['p'],
  desc: 'Angalia speed ya bot',
  async execute(sock, m, args, from) {
    const start = Date.now();
    await sock.sendMessage(from, { text: '🏓 Pinging...' });
    const end = Date.now();
    await sock.sendMessage(from, { text: `*PONG!* 🚀\nSpeed: ${end - start}ms\nBot: Sila Tech` });
  }
}