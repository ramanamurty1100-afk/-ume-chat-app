import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '1mb' }));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: allowedOrigin } });
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET must be set');

function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    req.user = jwt.verify(token, secret);
    next();
  } catch { res.status(401).json({ error: 'Authentication required' }); }
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'U&Me API' }));
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name?.trim() || !/^\\S+@\\S+\\.\\S+$/.test(email || '') || !password || password.length < 8)
      return res.status(400).json({ error: 'Provide name, valid email and password (8+ characters).' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { name: name.trim(), email: email.toLowerCase(), passwordHash }, select: { id:true, name:true, email:true } });
    const token = jwt.sign({ id: user.id, name: user.name }, secret, { expiresIn: '7d' });
    res.status(201).json({ user, token });
  } catch {
    res.status(409).json({ error: 'Account could not be created. Email may already be registered.' });
  }
});
app.post('/api/auth/login', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: (req.body.email || '').toLowerCase() } });
  if (!user || !await bcrypt.compare(req.body.password || '', user.passwordHash))
    return res.status(401).json({ error: 'Invalid email or password.' });
  const token = jwt.sign({ id: user.id, name: user.name }, secret, { expiresIn: '7d' });
  res.json({ user: { id:user.id, name:user.name, email:user.email }, token });
});
app.get('/api/users', auth, async (req, res) => {
  const users = await prisma.user.findMany({ where: { id: { not: req.user.id } }, select: { id:true, name:true, email:true }, take: 100 });
  res.json(users);
});
app.post('/api/conversations', auth, async (req, res) => {
  const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds : [];
  const ids = [...new Set([req.user.id, ...memberIds])];
  const conversation = await prisma.conversation.create({ data: {
    title: req.body.title || null, isGroup: Boolean(req.body.isGroup),
    members: { create: ids.map(userId => ({ userId })) }
  }, include: { members: { include: { user: { select: { id:true, name:true, email:true } } } } } });
  res.status(201).json(conversation);
});
app.get('/api/conversations', auth, async (req, res) => {
  const rows = await prisma.conversation.findMany({
    where: { members: { some: { userId: req.user.id } } },
    include: { members: { include: { user: { select: { id:true, name:true } } } },
      messages: { orderBy: { createdAt:'desc' }, take:1 } },
    orderBy: { createdAt:'desc' }
  });
  res.json(rows);
});
app.get('/api/conversations/:id/messages', auth, async (req, res) => {
  const membership = await prisma.membership.findUnique({ where: { userId_conversationId: { userId:req.user.id, conversationId:req.params.id } } });
  if (!membership) return res.status(403).json({ error:'Not a conversation member' });
  const messages = await prisma.message.findMany({ where:{ conversationId:req.params.id }, include:{ sender:{ select:{ id:true, name:true } } }, orderBy:{ createdAt:'asc' }, take:200 });
  res.json(messages);
});
io.use((socket, next) => {
  try { socket.user = jwt.verify(socket.handshake.auth?.token, secret); next(); }
  catch { next(new Error('Unauthorized')); }
});
io.on('connection', socket => {
  socket.on('conversation:join', async conversationId => {
    const membership = await prisma.membership.findUnique({ where:{ userId_conversationId:{ userId:socket.user.id, conversationId } } });
    if (membership) socket.join(conversationId);
  });
  socket.on('message:send', async ({ conversationId, body }) => {
    if (typeof body !== 'string' || !body.trim() || body.length > 10000) return;
    const membership = await prisma.membership.findUnique({ where:{ userId_conversationId:{ userId:socket.user.id, conversationId } } });
    if (!membership) return;
    const message = await prisma.message.create({ data:{ conversationId, senderId:socket.user.id, body:body.trim() }, include:{ sender:{ select:{ id:true, name:true } } } });
    io.to(conversationId).emit('message:new', message);
  });
});
const port = Number(process.env.PORT || 4000);
server.listen(port, () => console.log(`U&Me API listening on ${port}`));
