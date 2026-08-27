# vendor

`three.module.min.js` / `three.core.min.js` — three.js r185.1 (MIT, `three-LICENSE.txt`).
CDN 대신 저장소에 넣어 둔 이유: 링크 하나로 열리고 인터넷 없이도 돌아야 하기 때문.

갱신하려면:

```bash
npm install --save-dev three@<버전>
cp node_modules/three/build/three.module.min.js node_modules/three/build/three.core.min.js mahjong/vendor/
cp node_modules/three/LICENSE mahjong/vendor/three-LICENSE.txt
```
