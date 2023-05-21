import { google } from 'googleapis';
import express from 'express';
import open from 'open';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const port = 4000;

const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, REFRESH_TOKEN } = process.env;

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const getEmails = async (query) => {
  const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
  });

  const emails = res.data.messages || [];
  return emails;
}
const checkPriorReplies = async (threadId) => {
  const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

  const res = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
  });

  const thread = res.data;
  const messages = thread.messages || [];

  const hasPriorReplies = messages.some((message) =>
    message.labelIds.includes('SENT')
  );
  return hasPriorReplies;
}

const sendEmailReply = async (email) => {
  const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

  const message = createReplyMessage(
    email.subject,
    email.from,
    'Auto-reply: Thanks for your email!'
  );

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: message,
      threadId: email.threadId,
    },
  });
};

const addLabelToEmail = async (emailId, labelName) => {
  const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

  const res = await gmail.users.labels.list({ userId: 'me' });
  const labels = res.data.labels || [];
  const label = labels.find((label) => label.name === labelName);

  if (!label) {
    const res = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        label: {
          name: labelName,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      },
    });
    label = res.data;
  }

  await gmail.users.messages.modify({
    userId: 'me',
    id: emailId,
    requestBody: {
      addLabelIds: [label.id],
    },
  });
};

const createReplyMessage = async (subject, from, content) => {
  const replySubject = `Re: ${subject}`;
  const replyTo = from;

  const messageParts = [
    `From: <${replyTo}>`,
    `To: <${replyTo}>`,
    `Subject: ${replySubject}`,
    'Content-Type: message/rfc822',
    '',
    content,
  ];

  const message = messageParts.join('\n');
  const encodedMessage = Buffer.from(message).toString('base64');
  return encodedMessage;
}

const handleEmails = async() => {
  try {
    const query = 'is:unread -from:me';
    const emails = await getEmails(query);

    for (const email of emails) {
      const threadId = email.threadId;
      const hasPriorReplies = await checkPriorReplies(threadId);

      if (!hasPriorReplies) {
        await sendEmailReply(email);
        await addLabelToEmail(email.id, 'Auto-Replied');
      }
    }
  } catch (error) {
    console.error('Error processing emails:', error);
  }

  const randomInterval = getRandomInterval(45000, 120000);
  setTimeout(handleEmails, randomInterval);
}

const getRandomInterval = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    console.log('Authentication successful!');
  } catch (error) {
    console.error('Authentication failed:', error);
  }
  res.send('Authentication successful! You can close this page now.');
});

app.listen(port, () => {
  console.log(`App is running on 4000`);
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.modify'],
  });
  open(authUrl);
});

handleEmails();
