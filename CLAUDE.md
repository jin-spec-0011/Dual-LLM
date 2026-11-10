# Dual LLM 교차검증 PWA

- 정적 파일 PWA (index.html 단일 파일, 서버 없음). 외부 프레임워크 금지.
- API 키는 기기 localStorage에만 저장. 저장소·로그·커밋에 절대 포함 금지.
- index.html 수정 시 sw.js의 CACHE 버전과 index.html의 APP_VER를 함께 올릴 것.
- 테스트: 저장소 루트를 정적 서버로 서빙한 뒤 `BASE_URL=http://127.0.0.1:8765/ node tests/e2e.mjs` (API는 모킹, 키 불필요).
- 코드는 생략 없이 완전한 형태로 작성. 커밋은 지정된 작업 브랜치에만, PR은 사용자가 요청할 때만.
