import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSettings } from './settingsParser'

const md = (body: string) => `# 설정\n\n## 기본 정보\n- 체계 ID: t-1\n- 체계 이름: 테스트\n- 직접 입력 허용: 아니오\n\n## 시스템/도구 기본 목록\n- 메일\n\n${body}`

describe('config/설정.md', () => {
  it('현재 설정 파일은 오류 없이 읽히고, 기존 코드 체계와 같다', () => {
    const { settings, errors } = parseSettings(readFileSync('config/설정.md', 'utf8'))
    expect(errors).toEqual([])
    expect(settings.templateId).toBe('hr-temp-2026-09')
    expect(settings.allowCustom).toBe(true)
    const hr = settings.tree[0]
    expect(hr).toMatchObject({ code: 'HR', name: '인사' })
    expect(hr.children).toHaveLength(9)
    // R1 제출 파일과 호환되려면 자동 코드가 이전과 같아야 한다
    expect(hr.children![1]).toMatchObject({ code: 'HR.02', name: '채용' })
    expect(hr.children![1].children![1]).toEqual({ code: 'HR.02.02', name: '경력 채용' })
    expect(hr.children![5].children![0]).toEqual({ code: 'HR.06.01', name: '급여' })
    expect(settings.recommendedMin).toBe(8)
    expect(settings.recommendedMax).toBe(20)
    expect(settings.presetTools).toEqual(['메일', '엑셀', '전화', '메신저', '대면', '종이/출력', '전자결재', 'HRIS'])
    expect(settings.commonDepts).toContain('현업 부서')
    expect(settings.diagnosis.actions.map((t) => t.name)).toEqual(['Eliminate', 'Replace', 'Assist', 'reStructure', 'Keep'])
    expect(settings.diagnosis.actions.every((t) => t.definition === '')).toBe(true) // "(정의 입력)" 은 빈 값
  })

  it('4칸 들여쓰기·탭·* 기호와 직접 지정한 코드를 받아들인다', () => {
    const { settings, errors } = parseSettings(md('## 프로세스 체계\n* 인사 [HR]\n    * 채용 [REC]\n\t\t* 경력 채용\n    * 평가\n        + 성과 평가\n- 재무 [FI]\n  - 결산\n    - 월 결산\n'))
    expect(errors).toEqual([])
    expect(settings.allowCustom).toBe(false)
    expect(settings.tree.map((n) => n.code)).toEqual(['HR', 'FI'])
    expect(settings.tree[0].children!.map((n) => n.code)).toEqual(['REC', 'HR.02'])
    expect(settings.tree[0].children![0].children![0]).toEqual({ code: 'REC.01', name: '경력 채용' })
    expect(settings.tree[1].children![0].children![0].code).toBe('FI.01.01')
  })

  it('잘못된 곳을 줄 번호와 함께 알려준다', () => {
    const { errors } = parseSettings(md('## 프로세스 체계\n- 인사 [HR]\n  - 채용\n      - 경력 채용\n    - 신입 채용\n  - 평가\n  - 채용\n        - 너무 깊음\n          - 더 깊음\n그냥 문장\n\n## 작성 규칙\n- 권장 활동 수 최소: 스물\n- 권장 활동 수 최대: 5\n'))
    expect(errors.join('\n')).toMatch(/15번째 줄: 들여쓰기가 위 줄들과 맞지 않습니다/)
    expect(errors.join('\n')).toMatch(/"채용" 이\(가\) 같은 단계에 두 번/)
    expect(errors.join('\n')).toMatch(/L3 보다 깊게/)
    expect(errors.join('\n')).toMatch(/목록은 "- " 로 시작해야 합니다: "그냥 문장"/)
    expect(errors.join('\n')).toMatch(/"권장 활동 수 최소" 는 1–200 사이 숫자/)
    expect(errors.join('\n')).toMatch(/L2 "인사 › 평가" 아래에 L3 가 없습니다/)
  })

  it('필수 항목이 없으면 알려준다', () => {
    const { errors } = parseSettings('# 설정\n## 기본 정보\n- 직접 입력 허용: 글쎄\n')
    expect(errors.join('\n')).toMatch(/"예" 또는 "아니오"/)
    expect(errors.join('\n')).toMatch(/체계 ID/)
    expect(errors.join('\n')).toMatch(/프로세스 체계.*제목이 없습니다/)
    expect(errors.join('\n')).toMatch(/시스템\/도구 기본 목록이 비어/)
  })
})
