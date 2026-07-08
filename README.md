# Neon Racer 3D V10 — Rapier + GLTF

這版把 V6、V7、V8、V9 的內容整合後，再加入：

- Three.js + Rapier 真物理引擎
- GLTF 車模載入流程
- 內建 `assets/cars/neon-supercar.gltf`
- Rapier 車輛剛體與碰撞盒
- Rapier 外圈與內圈護欄碰撞
- 物理力道式油門、煞車、側滑、漂移
- 仍保留手機觸控、漂移煙霧、胎痕、AI 戰術、高品質賽道

## 操作

### 手機

- 左下虛擬方向盤
- GAS：油門
- BRAKE：煞車
- NITRO：氮氣
- DRIFT：漂移

### 電腦

- W / ↑：油門
- S / ↓：煞車
- A / ←：左轉
- D / →：右轉
- Shift：氮氣
- Space：漂移

## 重要

這版使用 ES Modules、Rapier WASM、GLTFLoader。  
建議用本機伺服器或 GitHub Pages 開啟，不建議直接雙擊 `index.html`。

```bash
python3 -m http.server 8000
```

然後打開：

```text
http://localhost:8000
```

## GLTF 車模替換

你可以把真正的車模放到：

```text
assets/cars/neon-supercar.gltf
```

或改 `app.js` 裡這一行：

```js
loader.loadAsync("./assets/cars/neon-supercar.gltf")
```

之後就能替換成更高品質的車模。
