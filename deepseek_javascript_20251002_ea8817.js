// routes/mediaEditing.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { MediaFilterService } from '../services/mediaFilterService.js';
import multer from 'multer';

const router = express.Router();
const mediaFilterService = new MediaFilterService();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Apply filter to image
router.post('/filter/image', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { filter, intensity = 1.0, filters } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'No image provided' });
    }

    let processedImage;

    if (filters) {
      // Apply multiple filters
      const filterStack = JSON.parse(filters);
      processedImage = await mediaFilterService.applyFilterStack(
        req.file.buffer, 
        filterStack
      );
    } else if (filter) {
      // Apply single filter
      processedImage = await mediaFilterService.applyImageFilter(
        req.file.buffer,
        filter,
        parseFloat(intensity)
      );
    } else {
      return res.status(400).json({ message: 'No filter specified' });
    }

    // Convert to base64 for response
    const base64Image = processedImage.toString('base64');
    const mimeType = req.file.mimetype;

    res.json({
      success: true,
      image: `data:${mimeType};base64,${base64Image}`,
      mimeType
    });

  } catch (error) {
    res.status(500).json({ message: 'Error processing image', error: error.message });
  }
});

// Crop image
router.post('/crop/image', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { x, y, width, height, aspectRatio } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'No image provided' });
    }

    const cropOptions = {
      x: x ? parseInt(x) : undefined,
      y: y ? parseInt(y) : undefined,
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
      aspectRatio: aspectRatio ? parseFloat(aspectRatio) : undefined
    };

    const croppedImage = await mediaFilterService.cropImage(
      req.file.buffer,
      cropOptions
    );

    const base64Image = croppedImage.toString('base64');
    const mimeType = req.file.mimetype;

    res.json({
      success: true,
      image: `data:${mimeType};base64,${base64Image}`,
      mimeType
    });

  } catch (error) {
    res.status(500).json({ message: 'Error cropping image', error: error.message });
  }
});

// Resize image
router.post('/resize/image', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { width, height, fit = 'cover' } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'No image provided' });
    }

    if (!width && !height) {
      return res.status(400).json({ message: 'Width or height required' });
    }

    const resizeOptions = {
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
      fit
    };

    const resizedImage = await mediaFilterService.resizeImage(
      req.file.buffer,
      resizeOptions
    );

    const base64Image = resizedImage.toString('base64');
    const mimeType = req.file.mimetype;

    res.json({
      success: true,
      image: `data:${mimeType};base64,${base64Image}`,
      mimeType,
      dimensions: {
        width: resizeOptions.width,
        height: resizeOptions.height
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Error resizing image', error: error.message });
  }
});

// Add text overlay
router.post('/text-overlay', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { text, x, y, fontSize, color, fontFamily } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'No image provided' });
    }

    if (!text) {
      return res.status(400).json({ message: 'Text is required' });
    }

    const textOptions = {
      text,
      x: parseInt(x) || 10,
      y: parseInt(y) || 10,
      fontSize: parseInt(fontSize) || 24,
      color: color || '#ffffff',
      fontFamily: fontFamily || 'Arial'
    };

    const imageWithText = await mediaFilterService.addTextOverlay(
      req.file.buffer,
      textOptions
    );

    const base64Image = imageWithText.toString('base64');
    const mimeType = req.file.mimetype;

    res.json({
      success: true,
      image: `data:${mimeType};base64,${base64Image}`,
      mimeType
    });

  } catch (error) {
    res.status(500).json({ message: 'Error adding text overlay', error: error.message });
  }
});

// Get available filters
router.get('/filters', authMiddleware, async (req, res) => {
  try {
    const filters = await mediaFilterService.getAvailableFilters();
    
    res.json({
      filters: filters.map(filter => ({
        name: filter.name,
        config: filter.config,
        preview: filter.preview ? filter.preview.toString('base64') : null
      }))
    });

  } catch (error) {
    res.status(500).json({ message: 'Error getting filters', error: error.message });
  }
});

// Batch process multiple edits
router.post('/batch-edit', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { operations } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'No image provided' });
    }

    if (!operations) {
      return res.status(400).json({ message: 'No operations specified' });
    }

    let processedImage = req.file.buffer;
    const operationsList = JSON.parse(operations);

    for (const operation of operationsList) {
      switch (operation.type) {
        case 'filter':
          processedImage = await mediaFilterService.applyImageFilter(
            processedImage,
            operation.filter,
            operation.intensity || 1.0
          );
          break;

        case 'crop':
          processedImage = await mediaFilterService.cropImage(
            processedImage,
            operation.options
          );
          break;

        case 'resize':
          processedImage = await mediaFilterService.resizeImage(
            processedImage,
            operation.options
          );
          break;

        case 'rotate':
          processedImage = await mediaFilterService.rotateImage(
            processedImage,
            operation.angle
          );
          break;

        case 'text':
          processedImage = await mediaFilterService.addTextOverlay(
            processedImage,
            operation.options
          );
          break;

        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }
    }

    const base64Image = processedImage.toString('base64');
    const mimeType = req.file.mimetype;

    res.json({
      success: true,
      image: `data:${mimeType};base64,${base64Image}`,
      mimeType
    });

  } catch (error) {
    res.status(500).json({ message: 'Error processing batch edits', error: error.message });
  }
});