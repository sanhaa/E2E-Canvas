/**
 * 강사 지정 L1–L3 프로세스 체계.
 *
 * ⚠ 현재는 임시 체계다. 강사 확정본을 받으면 이 파일의 TAXONOMY 만 교체하고
 *   id 를 새 값으로 바꾼 뒤 allowCustom 을 false 로 두고 다시 빌드한다.
 */

export interface TaxNode {
  code: string
  name: string
  children?: TaxNode[]
}

export interface TaxonomyTemplate {
  id: string
  title: string
  /** true 면 각 레벨에서 "직접 입력"을 허용한다 (체계 미확정 시 대비). */
  allowCustom: boolean
  tree: TaxNode[]
}

const l3 = (code: string, names: string[]): TaxNode[] =>
  names.map((name, i) => ({ code: `${code}.${String(i + 1).padStart(2, '0')}`, name }))

export const TAXONOMY: TaxonomyTemplate = {
  id: 'hr-temp-2026-09',
  title: '인사 프로세스 체계 (임시)',
  allowCustom: true,
  tree: [
    {
      code: 'HR',
      name: '인사',
      children: [
        { code: 'HR.01', name: '인력계획', children: l3('HR.01', ['인력운영계획 수립', '조직 설계', '정원(T/O) 관리']) },
        { code: 'HR.02', name: '채용', children: l3('HR.02', ['신입 채용', '경력 채용', '인턴·계약직 채용', '채용 브랜딩']) },
        { code: 'HR.03', name: '입사·온보딩', children: l3('HR.03', ['입사 처리', '온보딩 프로그램']) },
        { code: 'HR.04', name: '인사운영', children: l3('HR.04', ['발령(배치·이동·승진)', '근태 관리', '휴직·복직', '인사정보 관리', '제증명 발급']) },
        { code: 'HR.05', name: '평가', children: l3('HR.05', ['목표 설정', '성과 평가', '역량 평가', '다면 평가']) },
        { code: 'HR.06', name: '보상', children: l3('HR.06', ['급여', '연봉 조정', '성과급', '복리후생']) },
        { code: 'HR.07', name: '육성', children: l3('HR.07', ['교육 기획', '교육 운영', '리더십 육성']) },
        { code: 'HR.08', name: '노무·조직문화', children: l3('HR.08', ['노사관계', '조직문화', '고충 처리']) },
        { code: 'HR.09', name: '퇴직', children: l3('HR.09', ['퇴직 처리', '퇴직금 정산', '퇴직 면담']) },
      ],
    },
  ],
}
