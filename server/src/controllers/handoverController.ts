import { Response } from 'express';
import { UserRequest } from '../middleware/auth';
import Handover from '../models/Handover';

// Create a new handover
export const createHandover = async (req: UserRequest, res: Response) => {
  try {
    const { content, checklist, isImportant } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const newHandover = new Handover({
      writer: userId,
      content,
      checklist,
      isImportant: isImportant || false,
    });

    await newHandover.save();
    res.status(201).json(newHandover);
  } catch (error) {
    console.error('Error creating handover:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get handovers (e.g., latest ones)
export const getHandovers = async (req: UserRequest, res: Response) => {
  try {
    // Fetch recent handovers, populated with writer info
    const handovers = await Handover.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('writer', 'name username')
      .populate('confirmedBy', 'name username');

    res.json(handovers);
  } catch (error) {
    console.error('Error fetching handovers:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Confirm a handover
export const confirmHandover = async (req: UserRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const handover = await Handover.findById(id);
    if (!handover) {
      return res.status(404).json({ message: 'Handover not found' });
    }

    const alreadyConfirmed = handover.confirmedBy.some(
      (id: any) => id.toString() === userId
    );

    if (alreadyConfirmed) {
      return res.status(400).json({ message: 'Already confirmed by you' });
    }

    handover.confirmed = true;
    handover.confirmedBy.push(userId as any);
    await handover.save();

    // Return the updated handover with populated fields
    const updatedHandover = await Handover.findById(id)
        .populate('writer', 'name username')
        .populate('confirmedBy', 'name username');

    res.json(updatedHandover);
  } catch (error) {
    console.error('Error confirming handover:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update a handover
export const updateHandover = async (req: UserRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { content, checklist, isImportant } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const handover = await Handover.findById(id);
    if (!handover) {
      return res.status(404).json({ message: 'Handover not found' });
    }

    if (handover.writer.toString() !== userId) {
      return res.status(403).json({ message: 'You can only edit your own handovers' });
    }

    handover.content = content || handover.content;
    handover.checklist = checklist || handover.checklist;
    if (typeof isImportant === 'boolean') {
        handover.isImportant = isImportant;
    }

    await handover.save();
    
    const updatedHandover = await Handover.findById(id)
        .populate('writer', 'name username')
        .populate('confirmedBy', 'name username');

    res.json(updatedHandover);
  } catch (error) {
    console.error('Error updating handover:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
