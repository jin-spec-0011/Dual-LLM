# Dual LLM 교차검증 PWA v1.0.0

하나의 코드로 PC(설치형 앱 창)와 폰(홈 화면 앱)에서 함께 씁니다.
- 1024px 이상(PC): 입력 | 해결안 | 검증 결과를 가로로 나란히 표시
- 1024px 미만(폰): 세로로 쌓아서 표시

## 파일
| 파일 | 역할 |
|---|---|
| index.html | 앱 본체 (HTML/CSS/JS 단일 파일) |
| manifest.webmanifest | PWA 설치 정보 |
| sw.js | 오프라인용 앱 셸 캐시 (API 호출은 캐시하지 않음) |
| icon-180/192/512.png | 아이콘 |

## 1. 배포 (GitHub Pages)
1. 새 저장소를 만들고 위 파일 6개를 루트에 올립니다. **API 키는 저장소에 넣지 않습니다.**
2. Settings → Pages → Branch: `main` / `(root)` → Save
3. `https://<아이디>.github.io/<저장소>/` 로 접속합니다.
4. 이후 index.html을 고칠 때마다 `sw.js`의 `CACHE` 버전을 올려야 기기에 새 버전이 반영됩니다.

## 2. 설치
- PC (Chrome/Edge): 주소창 오른쪽 설치 아이콘 → 별도 앱 창으로 실행
- iPhone (Safari): 공유 → 홈 화면에 추가
- Android (Chrome): 메뉴 → 앱 설치

## 3. API 키 (기기마다 1회 입력)
| 서비스 | 발급처 | 비고 |
|---|---|---|
| Gemini | Google AI Studio → Get API key | 결제 연결 필요 (gemini-4-argon은 유료 등급) |
| Claude | console.anthropic.com → API Keys | 크레딧 충전 필요 |

- 구독(Gemini Pro, Claude Pro)과 API 요금은 별개입니다.
- 키는 각 기기의 localStorage에만 저장되고 Firebase로 동기화되지 않습니다.
- 두 콘솔에서 **월 사용 한도를 먼저 설정**하십시오.
- 설정 → "키 연결 테스트"로 확인합니다.

## 4. PC ↔ 폰 기록 동기화 (선택, Firebase 무료 Spark 요금제로 충분)
1. Firebase 콘솔 → 프로젝트 생성 → 웹 앱 추가 → `firebaseConfig` 복사
2. Build → Realtime Database → 데이터베이스 만들기 (잠금 모드)
3. Build → Authentication → Sign-in method → **이메일/비밀번호** 사용 설정
4. Authentication → Settings → 승인된 도메인에 `<아이디>.github.io` 추가
5. Realtime Database → 규칙에 아래를 붙여넣고 게시:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

6. 앱 설정에 `firebaseConfig` JSON 붙여넣기 → 설정 저장 → **새로고침**
7. 첫 기기에서 "계정 생성", 다른 기기에서는 같은 계정으로 "로그인"

동기화 대상: 작업 기록(문제·해결안·검증·판정·KPI 평가). 동기화 제외: API 키, 첨부 사진.

## 5. 동작 순서
1. 업무 유형 선택 → 해결/검증 모델이 계획서 매트릭스대로 자동 지정 (코드·문서는 Claude 해결)
2. 실행 → 해결안 → 검증 (첫 줄 `판정: 통과/조건부 통과/반려` 자동 판독)
3. 반려 → 결함 표를 해결 모델에 다시 보내 수정 → 재검증 (기본 최대 2라운드)
4. 최대 라운드 초과 또는 판정 불명 → "사람 판단" 상태로 종료
5. 사후 평가(오탐/재작업) 체크 → 기록 탭 KPI와 CSV에 반영

## 기본 단가 (USD / 100만 토큰, 설정에서 수정 가능)
| 모델 | 입력 | 출력 |
|---|---|---|
| gemini-4-argon | 2 (2026-11-30까지) → 4 | 10 → 20 |
| claude-opus-5-5 | 4 | 20 |

비용은 응답의 토큰 사용량으로 계산한 추정치이며, 실제 청구액은 각 콘솔에서 확인하십시오.
