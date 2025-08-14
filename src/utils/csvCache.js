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
    const rows = rowsByVer[ver] || []; // [{company, 'TIP TYPE', ID}, ...]
    
    // 1) 회사 목록 (중복 제거 및 정렬)
    const countries = Array.from(new Set(rows.map(r => r.company?.trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'ko'));
    
    // 2) 회사별 TIP 리스트
    const needlesByCompany = new Map();
    for (const r of rows) {
      if (!r.company || !r['TIP TYPE'] || !r.ID) continue;
      
      const k = r.company.trim();
      const arr = needlesByCompany.get(k) || [];
      arr.push({ 
        label: r['TIP TYPE'].trim(), 
        value: r['TIP TYPE'].trim(), 
        id: r.ID.trim() 
      });
      needlesByCompany.set(k, arr);
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
    console.log('CSV 캐시 초기화 시작...');
    
    if (!rowsByVer || (!rowsByVer['2.0'] && !rowsByVer['4.0'])) {
      console.warn('캐시할 데이터가 없습니다.');
      cache = { ready: false, data: {} };
      return;
    }

    // 캐시 빌드
    cache = buildCache(rowsByVer);
    
    console.log('CSV 캐시 초기화 완료');
    console.log('캐시된 국가 수:', {
      'MTR 2.0': cache.data['2.0']?.countries?.length || 0,
      'MTR 4.0': cache.data['4.0']?.countries?.length || 0
    });
    
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
