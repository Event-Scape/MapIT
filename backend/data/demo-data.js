export const ROSTER = [
  { name: "김교수", uid: "P0001", role: "professor" },
  { name: "이교수", uid: "P0002", role: "professor" },
  { name: "김철수", uid: "2024001", role: "student", team: "A팀" },
  { name: "이영희", uid: "2024002", role: "student", team: "A팀" },
  { name: "박민수", uid: "2024003", role: "student", team: "A팀" },
  { name: "최준호", uid: "2024004", role: "student", team: "B팀" },
  { name: "정수아", uid: "2024005", role: "student", team: "B팀" },
  { name: "박지민", uid: "2024006", role: "student", team: "C팀" },
  { name: "오민준", uid: "2024007", role: "student", team: "C팀" }
];

export const DEMO_EVENTS = [
  {
    id: 1,
    title: "2026 AI 글로벌 컨벤션",
    team_name: "A팀",
    members: "김철수, 이영희, 박민수",
    type: "Convention",
    field: "ICT / 인공지능",
    loc: "Seoul, COEX",
    lat: 37.5125,
    lng: 127.0589,
    topic: "생성형 AI 시대의 윤리와 기술",
    description:
      "COEX Hall A/B 및 그랜드볼룸을 활용한 분과 세션 기획. 국내외 AI 리더 200명 키노트 초청.",
    scale: "3,000명",
    votes: 45,
    files: ["기획서_초안_v2.pdf", "베뉴_분석보고서.pptx"],
    feedbacks: [
      {
        user_name: "김교수",
        role: "professor",
        content: "베뉴 선정이 타당합니다. 글로벌 접근성 관련 호텔 인프라 데이터를 추가 분석해 주세요."
      },
      {
        user_name: "이영희",
        role: "student",
        content: "갈라 디너 장소로 주변 문화재 활용도 고려해보셨나요?"
      }
    ]
  },
  {
    id: 2,
    title: "K-Food 박람회",
    team_name: "B팀",
    members: "최준호, 정수아",
    type: "Exhibition",
    field: "식문화 / 한류",
    loc: "Paris, Expo",
    lat: 48.8322,
    lng: 2.2875,
    topic: "한국 식문화의 유럽 확산",
    description:
      "Paris Expo Porte de Versailles 활용 B2B/B2C 통합 전시회. 300개 부스 구성.",
    scale: "10,000명",
    votes: 38,
    files: ["KFood_기획서.pdf"],
    feedbacks: [
      {
        user_name: "김교수",
        role: "professor",
        content: "파리 현지 파트너사 협력 방안이 구체화되면 더욱 설득력 있는 기획이 됩니다."
      }
    ]
  },
  {
    id: 3,
    title: "메타버스 리더스 포럼",
    team_name: "C팀",
    members: "박지민, 오민준",
    type: "Meeting",
    field: "메타버스 / XR",
    loc: "Singapore, MBS",
    lat: 1.2823,
    lng: 103.8595,
    topic: "메타버스 산업 동향 및 글로벌 네트워킹",
    description:
      "Marina Bay Sands Convention Center 활용. C-Level 한정 클로즈드 포럼 형태.",
    scale: "500명",
    votes: 29,
    files: ["싱가포르_베뉴_분석.pdf", "MBS_견적서.xlsx"],
    feedbacks: []
  }
];

export const DEMO_TEAMS = [
  { name: "A팀", color: "#3b7eff" },
  { name: "B팀", color: "#ff4f6b" },
  { name: "C팀", color: "#2dd4bf" }
];

