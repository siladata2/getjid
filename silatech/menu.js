module.exports = {
  name: 'menu',
  alias: ['help', 'list'],
  desc: 'Onyesha menu',
  async execute(sock, m, args, from, commands) {
    let menu = `*╭─「 SILA TECH BOT 」─*\n`;
    menu += `*│* 🤖 Online: ✅\n`;
    menu += `*│* 📁 Commands: ${commands.size}\n`;
    menu += `*╰───────────────*\n\n`;
    
    // Onyesha commands zote
    let unique = [...new Set([...commands.values()])];
    unique.forEach(cmd => {
      menu += `*• .${cmd.name}* - ${cmd.desc || ''}\n`;
    });
    
    menu += `\n_© Sila Tech 2025_`;
    await sock.sendMessage(from, { text: menu });
  }
}