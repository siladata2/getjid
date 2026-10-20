const { sendInteractiveMessage } = require('gifted-btns');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = {
  name: 'jid',
  alias: ['getjid', 'linktojid', 'channeljid'],
  desc: 'Convert channel link to JID',

  async execute(sock, m, args, from) {
    const link = args[0];
    if (!link) {
      return sock.sendMessage(from, {
        text: `[ USAGE ]\n.jid https://whatsapp.com/channel/0029Vb6...`
      });
    }

    try {
      let inviteCode = link.trim();
      const match = inviteCode.match(/channel\/([A-Za-z0-9]+)/);
      if (match) inviteCode = match[1];

      if (inviteCode.includes('@newsletter')) {
        await sleep(1000);
        await sendInteractiveMessage(sock, from, {
          text: `[ JID READY ]\n\n> Channel JID:\n${inviteCode}`,
          footer: 'Sila Tech',
          interactiveButtons: [
            {
              name: 'cta_copy',
              buttonParamsJson: JSON.stringify({
                display_text: 'Copy JID',
                copy_code: inviteCode
              })
            }
          ]
        });
        return;
      }

      await sock.sendMessage(from, { text: `[ PROCESSING ]\n> Converting ${inviteCode}...` });

      let info;
      try {
        info = await sock.newsletterMetadata('invite', inviteCode);
      } catch {
        info = await sock.newsletterFetchInviteInfo(inviteCode);
      }

      const jid = info.id || info.jid;
      const name = info.name || 'Unknown';
      const followers = info.subscribers || 0;

      const messageText = `[ CONVERTED SUCCESS ]

> Name: ${name}
> Followers: ${followers}
> Invite: ${inviteCode}

[ JID ]
${jid}

> Tap button below to copy`;

      await sleep(1200);

      await sendInteractiveMessage(sock, from, {
        text: messageText,
        footer: 'Sila Tech | Channel Tool',
        interactiveButtons: [
          {
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
              display_text: 'Copy JID',
              copy_code: jid
            })
          }
        ]
      });

    } catch (e) {
      await sock.sendMessage(from, { text: `[ ERROR ]\n> ${e.message}` });
    }
  }
}