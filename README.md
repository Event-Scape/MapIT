# MapIT
MICE 교과용 학생-교수 상호작용 플랫폼

**데이터 지리학 기반 인터랙티브 MICE 기획 및 시뮬레이션 솔루션**

-----

## 📌 Project Overview

**MICE-Scape**는 기존의 2차원적이고 단절된 MICE 기획 프로세스를 혁신하기 위한 **Geo-SaaS(Software as a Service)** 플랫폼입니다. 전 세계 베뉴(Venue) 데이터와 지역 인프라를 지도 위에 결합하여, 기획자가 현장에 가보지 않고도 공간의 맥락을 완벽히 이해하고 의사결정할 수 있도록 돕습니다.

### 🎯 핵심 문제 정의 (Pain Points)

1.  **기획의 사각지대:** 텍스트와 이미지 중심의 제안서는 실제 교통·숙박 인프라와의 연결성을 보여주지 못함.
2.  **높은 리스크:** 글로벌 기획자의 \*\*80%\*\*가 지정학적·경제적 리스크로 인한 계약 지연을 경험함.
3.  **낮은 DX(Digital Transformation):** MICE 산업의 높은 부가가치($2,235/인)에도 불구하고 기획 도구는 여전히 아날로그 방식에 체류.

-----

## ✨ Key Features

### 1\. Geo-Authoring (입체적 기획)

  - **Globe Projection:** Mapbox 기반의 3D 지구본 모드로 전 세계 베뉴를 직관적으로 탐색.
  - **Smart Pinning:** 지도 위 클릭만으로 행사 개요, 동선, 인프라를 즉시 매핑.
  - **Mode Toggle:** 사용자 환경에 최적화된 **Dark / Light / Satellite** 모드 실시간 전환.

### 2\. Role-based Governance (권한 기반 협업)

  - **RBAC 설계:** Supabase Auth를 활용하여 교수(전문가)와 학생(기획자)의 권한을 엄격히 분리.
  - **Feedback Loop:** 전문가의 실시간 피드백 및 기획안 랭킹 시스템을 통한 시장성 검증.

### 3\. AI-Driven Insights (지능형 분석)

  - **Gemini AI 연동:** 기획된 좌표 주변의 인프라를 분석하여 행사 적합도 및 예상 ROI 자동 산출.
  - **Trend Curation:** 'Slow MICE' 및 ESG 가이드라인에 맞춘 유니크 베뉴(Unique Venue) 추천.

### 4\. Real-time Communication

  - **Integrated Chat:** 기획안별 전용 실시간 채팅 채널을 통해 교수-학생 간 피드백 루프 극대화.

-----

## 🛠 Tech Stack

  - **Frontend:** React.js, Tailwind CSS (Atomic Design)
  - **Map Engine:** Mapbox GL JS v2.15+ (3D Globe & Projection)
  - **Backend/DB:** Supabase (PostgreSQL, Realtime, Auth, RLS)
  - **AI Engine:** Google Gemini Pro API
  - **Deployment:** Vercel (CI/CD Pipeline)

-----

## 🏗 System Architecture

-----

## 📅 Roadmap

  - [x] **Phase 1:** UI/UX 프로토타입 및 Mapbox 엔진 최적화
  - [ ] **Phase 2:** Supabase DB 연동 및 유저 권한 시스템(RLS) 구축
  - [ ] **Phase 3:** Gemini AI 기반 인프라 추천 로직 구현
  - [ ] **Phase 4:** 실제 MICE 학과 시범 운영 및 피드백 반영

-----

## 👤 Author

  - **Name:** 정지유
  - **Organization:** [MICE-Scape Official](https://www.google.com/search?q=https://github.com/MICE-Scape)
  - **Contact:** zieyou52@ewha.ac.kr
  - **Role:** Full-stack Developer & Service Planner

-----

## 📄 License

This project is licensed under the MIT License.
