const express = require('express');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

app.post('/api/translate', upload.array('images', 10), async (req, res) => {
  try {
    const textContext = req.body.text || '';
    const imageFiles = req.files;

    if (!imageFiles || imageFiles.length === 0) {
      return res.status(400).json({ error: '画像データ（時系列フレーム）が必要です。' });
    }

    const systemInstructionPath = path.join(__dirname, 'system_instruction.md');
    const userPromptPath = path.join(__dirname, 'user_prompt.md');

    const systemInstructionText = await fs.readFile(systemInstructionPath, 'utf-8');
    let userPromptRaw = await fs.readFile(userPromptPath, 'utf-8');

    userPromptRaw = userPromptRaw.replace('{{textContext}}', textContext || '（音声コンテキストなし）');
    userPromptRaw = userPromptRaw.replace('{{imageCount}}', imageFiles.length.toString());

    const contents = [userPromptRaw];

    imageFiles.forEach((file, index) => {
      const base64Image = file.buffer.toString('base64');
      contents.push(`[ビデオフレーム ${index + 1} (最古から数えて ${index + 1}枚目のフレーム)]`);
      contents.push({
        inlineData: {
          mimeType: file.mimetype,
          data: base64Image
        }
      });
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: systemInstructionText,
        responseMimeType: "application/json"
      }
    });

    const resultText = response.text;
    const resultJson = JSON.parse(resultText);

    return res.json(resultJson);

  } catch (error) {
    console.error('Error during translation pipeline:', error);
    return res.status(500).json({ 
      error: '翻訳処理、またはAI解析中にエラーが発生しました。', 
      details: error.message 
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});