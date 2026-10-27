<h1 align="center">🌱 Okra Leaf Disease Detection</h1>

<p align="center">
  <b>A Bangla voice-controlled Progressive Web App that helps farmers detect okra leaf diseases using YOLOv8 — right in the browser.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/YOLOv8-Classification-00FFFF?style=for-the-badge" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/ONNX_Runtime_Web-005CED?style=for-the-badge&logo=onnx&logoColor=white" />
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" />
  <img src="https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white" />
</p>

<p align="center">
  🔗 <a href="https://charsamia27-beep.github.io/okra-disease-web/"><b>Live Demo</b></a>
</p>

---

## 📖 Overview

Okra is an important vegetable crop in Bangladesh, but many farmers struggle to identify leaf diseases early. This project brings AI-powered disease detection to the farmer's phone. A farmer takes a photo of an okra leaf, and the app identifies the condition and gives advice — all through a **Bangla voice interface**, so it is usable even by farmers with low literacy.

The model runs **directly in the browser** using ONNX Runtime Web, so no image is sent to a server for prediction.

---



## ✨ Features

- 📷 **Leaf disease detection** from camera or gallery images using a YOLOv8n classification model
- 🎙️ **Bangla voice interface** with push-to-talk speech input and spoken responses
- 🌦️ **Weather advisory** to help farmers plan field work
- 👩‍🌾 **Farmer profile** storage
- 🕘 **Scan history** of previous detections
- ☁️ **Cloud sync** with Firebase Firestore (via REST API)
- 🚫 **Invalid image check** — detects when the photo is not an okra leaf
- 📱 **Installable PWA** — works like a mobile app on any phone

---

## 🧠 Model Details

| Item | Details |
|------|---------|
| Model | YOLOv8n-cls (Ultralytics) |
| Training | Google Colab (T4 GPU) |
| Dataset | Self-collected field images of okra leaves (~1,556 images) |
| Validation accuracy | ~86% |
| Held-out test accuracy | ~77% |
| Deployment | Exported to ONNX, runs in-browser with ONNX Runtime Web |

**Classes (6):**

| Class | Meaning |
|-------|---------|
| `cercospora` | Cercospora leaf spot |
| `healthy` | Healthy leaf |
| `insect_damage` | Damage caused by insects |
| `invalid` | Not an okra leaf / unusable image |
| `nutrient_deficiency` | Signs of nutrient deficiency |
| `yvmv` | Yellow Vein Mosaic Virus |

**Key design decisions:**

- **ONNX Runtime Web** is used for inference because TensorFlow.js export is deprecated by Ultralytics.
- **Center-cropping** reduces background noise in field photos.
- An **`invalid` class** acts as a leaf-presence check so the app does not give a diagnosis for random images.

---

## 🛠️ Tech Stack

- **Machine Learning:** Python, Ultralytics YOLOv8, PyTorch, Google Colab
- **Inference:** ONNX Runtime Web
- **Frontend:** TypeScript, HTML, CSS
- **Voice:** Browser speech recognition & text-to-speech (Bangla)
- **Database:** Firebase Firestore (REST API)
- **Hosting:** GitHub Pages

---

## 📁 Project Structure

```
okra-disease-web/
├── css/             # Stylesheets
├── data/            # App data (disease info, advice)
├── images/          # Icons and images
├── js/              # Compiled JavaScript (from ts/)
├── model/           # YOLOv8 model in ONNX format
├── ts/              # TypeScript source code (incl. predict.ts)
├── index.html       # Main app page
├── tsconfig.json    # TypeScript configuration
└── README.md
```

> ⚠️ `CLASS_ORDER` in `predict.ts` must exactly match the alphabetical folder order used during training.

---

## 🚀 Run Locally

This is a static web app, so it only needs a simple local server. (Opening `index.html` directly will not work, because the browser blocks loading the ONNX model from `file://`.)

```bash
# 1. Clone the repository
git clone https://github.com/charsamia27-beep/okra-disease-web.git
cd okra-disease-web

# 2. (Optional) Recompile TypeScript after editing files in ts/
npx tsc

# 3. Start a local server (choose one)
python -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000` in your browser.

> 🎙️ Voice features need microphone permission and work best in Google Chrome.

---

## 📦 Main Dependencies

- **ONNX Runtime Web** — runs the YOLOv8 model in the browser
- **TypeScript** — compiled to JavaScript with `tsc`
- **Firebase Firestore REST API** — cloud sync

No build tool or `npm install` is required to run the app.

---

## ⚠️ Disclaimer

This app is a research prototype. Treatment and chemical dosage suggestions have **not yet been verified by an agronomist**. Farmers should consult a local agriculture officer before applying any chemical.

---

## 🔮 Future Work

- Expand the dataset with images from more districts of Bangladesh
- Compare with other lightweight models (MobileNetV3, EfficientNet-B0, ResNet18)
- Support regional Bangla dialects in voice recognition
- Full offline mode

---

## 👩‍💻 Author

**Samia Sultana**
CSE, Primeasia University, Bangladesh

<p>
  <a href="https://www.linkedin.com/in/samia-sultana-a046841ba"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" /></a>
  <a href="mailto:stringsamia27@gmail.com"><img src="https://img.shields.io/badge/Gmail-D14836?style=for-the-badge&logo=gmail&logoColor=white" /></a>
  <a href="https://github.com/charsamia27-beep"><img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white" /></a>
</p>

⭐ If you find this project useful, please give it a star!
