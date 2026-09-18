import { END, FORMAT, FORMAT_VERSION, APP_VERSION, type Activity, type PiDoc } from './model'
import { TAXONOMY } from './config/settings'

/** 교육생이 수준을 맞출 수 있도록 제공하는 완성 예시: 경력 채용 › 채용 요청·공고 */
export function exampleDoc(): PiDoc {
  const a = (id: string, kind: Activity['kind'], dept: string, performer: string, name: string, tools: string[], next: Activity['next'] = [], note = ''): Activity =>
    ({ id, kind, dept, performer, name, tools, next, note })

  const activities: Activity[] = [
    a('ex01', 'task', '현업 부서', '팀장', '채용 요청서 작성', ['엑셀', '메일'], [], '팀마다 양식이 달라 누락 항목이 잦음'),
    a('ex02', 'task', '인사팀', '채용담당', '채용 요청서 접수', ['메일']),
    a('ex03', 'task', '인사팀', '채용담당', '정원(T/O) 현황 확인', ['HRIS', '엑셀'], [], 'HRIS 데이터와 엑셀 대장을 수기로 대조'),
    a('ex04', 'decision', '인사팀', '채용담당', '요청서 보완 필요 여부 판단', [], [{ to: 'ex05', label: '보완 필요' }, { to: 'ex06', label: '이상 없음' }]),
    a('ex05', 'task', '현업 부서', '팀장', '채용 요청서 보완', ['메일', '전화'], [{ to: 'ex02' }]),
    a('ex06', 'task', '인사팀', '채용담당', '채용 품의서 작성', ['전자결재']),
    a('ex07', 'decision', '경영진', '인사 임원', '채용 승인 여부 판단', ['전자결재'], [{ to: 'ex08', label: '승인' }, { to: END, label: '반려' }], '결재 대기 평균 4일'),
    a('ex08', 'task', '인사팀', '채용담당', '직무기술서(JD) 작성 요청', ['메일']),
    a('ex09', 'task', '현업 부서', '팀장', '직무기술서(JD) 작성', ['워드']),
    a('ex10', 'task', '인사팀', '채용담당', '채용 공고문 작성', ['워드']),
    a('ex11', 'task', '현업 부서', '팀장', '채용 공고문 검토', ['메일'], [], '회신 대기 평균 3일'),
    a('ex12', 'task', '인사팀', '채용담당', '채용 공고 게시', ['채용사이트']),
  ]

  const now = new Date().toISOString()
  // 설정.md 체계에 같은 이름이 있으면 그 코드를 쓰고, 없으면 직접 입력 항목으로 표시
  const l1 = TAXONOMY.tree.find((n) => n.name === '인사')
  const l2 = l1?.children?.find((n) => n.name === '채용')
  const l3 = l2?.children?.find((n) => n.name === '경력 채용')
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    meta: { author: '예시', dept: '인사팀', job: '채용', createdAt: now, updatedAt: now, appVersion: APP_VERSION },
    taxonomy: {
      templateId: TAXONOMY.id,
      l1: l1 ? { code: l1.code, name: l1.name } : { code: '', name: '인사' },
      l2: l2 ? { code: l2.code, name: l2.name } : { code: '', name: '채용' },
      l3: l3 ? { code: l3.code, name: l3.name } : { code: '', name: '경력 채용' },
    },
    process: {
      name: '채용 요청 및 공고',
      startEvent: '현업 부서의 결원·증원 발생',
      endEvent: '채용 공고 게시 완료',
      customer: '현업 부서 (채용 요청 부서)',
      owner: '인사팀장',
      frequency: '월 8건',
      description: '현업의 채용 요청부터 채용 공고 게시까지. 서류 전형 이후는 별도 L4(경력 채용 전형 운영)로 분리.',
      activities,
      asis: null,
      tobe: null,
    },
  }
}
