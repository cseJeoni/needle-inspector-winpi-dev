// CSV 캐시 모듈 - MTR 버전별 국가/니들 옵션 관리

// 전역 캐시 객체
let cache = {
  ready: false,
  data: {}
};

/**
 * CSV 데이터를 캐시 구조로 변환
 * @param {Object} rowsByVer - 버전별 CSV 데이터 { '2.0': [...], '4.0': [...] }
 * @returns {Object} 캐시 객체
 */
function buildCache(rowsByVer) {
  const data = {};
  
  for (const ver of ['2.0', '4.0']) {
    const rows = rowsByVer[ver] || [];
    
    // 1) 회사 목록 (중복 제거 및 정렬)
    // 다양한 컬럼명 패턴 지원
    const companyKeys = ['company', 'Company', 'COMPANY', '회사', '제조사'];
    const tipTypeKeys = ['TIP TYPE', 'tip type', 'Tip Type', 'tiptype', 'TipType', '니들타입', '타입'];
    const idKeys = ['ID', 'id', 'Id', 'ID번호', '번호'];
    
    const getFieldValue = (row, possibleKeys) => {
      for (const key of possibleKeys) {
        if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
          return String(row[key]).trim();
        }
      }
      return null;
    };
    
    const countries = Array.from(new Set(
      rows.map(r => getFieldValue(r, companyKeys)).filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'ko'));
    
    // 2) 회사별 TIP 리스트
    const needlesByCompany = new Map();
    for (const r of rows) {
      const company = getFieldValue(r, companyKeys);
      const tipType = getFieldValue(r, tipTypeKeys);
      const id = getFieldValue(r, idKeys);
      
      if (!company || !tipType || !id) {
        console.warn('불완전한 데이터 행:', { company, tipType, id, row: r });
        continue;
      }
      
      const arr = needlesByCompany.get(company) || [];
      arr.push({ 
        label: tipType, 
        value: tipType, 
        id: id 
      });
      needlesByCompany.set(company, arr);
    }
    
    
    // 각 회사별 TIP 리스트 정렬 및 중복 제거
    for (const [k, arr] of needlesByCompany) {
      // 중복 제거 (value 기준)
      const uniqueArr = arr.filter((item, index, self) => 
        index === self.findIndex(t => t.value === item.value)
      );
      // 정렬
      uniqueArr.sort((a, b) => a.label.localeCompare(b.label, 'ko'));
      needlesByCompany.set(k, uniqueArr);
    }
    
    // 3) 빠른 ID 조회용 맵 (회사|TIPTYPE → ID)
    const idByKey = new Map();
    for (const [k, arr] of needlesByCompany) {
      for (const t of arr) {
        idByKey.set(`${k}|${t.value}`, t.id);
      }
    }
    
    data[ver] = { countries, needlesByCompany, idByKey };
  }
  
  return { ready: true, data };
}

/**
 * (Electron Preload에서 전달받은) 데이터로 캐시 초기화
 * @param {Object} rowsByVer - 버전별 CSV 데이터 { '2.0': [...], '4.0': [...] }
 */
export function initializeCache(rowsByVer) {
  try {
    if (!rowsByVer || (!rowsByVer['2.0'] && !rowsByVer['4.0'])) {
      cache = { ready: false, data: {} };
      return;
    }

    // 캐시 빌드
    cache = buildCache(rowsByVer);
    
  } catch (error) {
    console.error('CSV 캐시 초기화 실패:', error);
    cache = { ready: false, data: {} };
  }
}

/**
 * 국가 옵션 조회
 * @param {string} ver - MTR 버전 ('2.0' 또는 '4.0')
 * @returns {Array} 국가 옵션 배열 [{ value, label }, ...]
 */
export function getCountryOptions(ver) {
  if (!cache.ready || !cache.data[ver]) return [];
  return cache.data[ver].countries.map(c => ({ value: c, label: c }));
}

/**
 * 니들 옵션 조회
 * @param {string} ver - MTR 버전 ('2.0' 또는 '4.0')
 * @param {string} company - 회사명
 * @returns {Array} 니들 옵션 배열 [{ value, label, id }, ...]
 */
export function getNeedleOptions(ver, company) {
  if (!cache.ready || !cache.data[ver]) return [];
  return (cache.data[ver].needlesByCompany.get(company) || [])
    .map(n => ({ value: n.value, label: n.label, id: n.id }));
}

/**
 * ID 조회 (O(1) 성능)
 * @param {string} ver - MTR 버전 ('2.0' 또는 '4.0')
 * @param {string} company - 회사명
 * @param {string} tipType - TIP TYPE
 * @returns {string|null} 해당하는 ID 또는 null
 */
export function getId(ver, company, tipType) {
  if (!cache.ready || !cache.data[ver]) return null;
  return cache.data[ver].idByKey.get(`${company}|${tipType}`) ?? null;
}

/**
 * 캐시 준비 상태 확인
 * @returns {boolean} 캐시가 준비되었는지 여부
 */
export function isCacheReady() {
  return cache.ready;
}

/**
 * 캐시 데이터 조회 (디버깅용)
 * @returns {Object} 전체 캐시 객체
 */
export function getCache() {
  return cache;
}

/**
 * 캐시를 완전히 리셋하고 새로운 데이터로 초기화
 * @param {Object} rowsByVer - 버전별 CSV 데이터 { '2.0': [...], '4.0': [...] }
 */
export function resetAndInitializeCache(rowsByVer) {
  try {
    console.log('🔄 CSV 캐시 강제 리셋 및 재초기화 시작');
    
    // 기존 캐시 완전 리셋
    cache = {
      ready: false,
      data: {}
    };
    
    if (!rowsByVer || (!rowsByVer['2.0'] && !rowsByVer['4.0'])) {
      console.warn('⚠️ 유효하지 않은 CSV 데이터, 빈 캐시로 설정');
      return;
    }

    // 새로운 데이터로 캐시 빌드
    cache = buildCache(rowsByVer);
    console.log('✅ CSV 캐시 강제 리셋 및 재초기화 완료');
    
  } catch (error) {
    console.error('❌ CSV 캐시 강제 리셋 실패:', error);
    cache = { ready: false, data: {} };
  }
}
