import express, { Request, Response } from 'express';
import {
  getRoomMessages,
  getUserRooms,
  createDirectRoom,
  createGroupRoom,
  getRoomMembers,
} from '../services/chatService';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET!;

router.get('/rooms/:userId', async (req: Request, res: Response) => {
  try {
    const rooms = await getUserRooms(req.params.userId as string);
    res.json({ success: true, rooms });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load rooms' });
  }
});

router.get('/messages/:roomId', async (req: Request, res: Response) => {
  try {
    const messages = await getRoomMessages(req.params.roomId as string);
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load messages' });
  }
});

router.get('/members/:roomId', async (req: Request, res: Response) => {
  try {
    const members = await getRoomMembers(req.params.roomId as string);
    res.json({ success: true, members });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load members' });
  }
});

router.post('/create-direct', async (req: Request, res: Response) => {
  try {
    const { userId1, userId2 } = req.body;
    const roomId = await createDirectRoom(userId1, userId2);
    res.json({ success: true, roomId });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create room' });
  }
});

router.post('/create-group', async (req: Request, res: Response) => {
  try {
    const { name, creatorId, memberIds } = req.body;
    const roomId = await createGroupRoom(name, creatorId, memberIds);
    res.json({ success: true, roomId });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create group' });
  }
});

export default router;