// GA 데이터 → 입자 속성 (순수 함수). obj는 0~1 정규화 가정.
// 이 파일은 vitest로 단위 테스트되는 유일한 순수 로직이다.

// dominated genome 밝기 감쇠 계수.
export const DIM_PENALTY = 0.35;

/**
 * 유전자 하나를 입자 속성으로 매핑한다.
 * obj[0],obj[1] (0~1) → x,y (-1~1 목적공간).
 * fitness → z(카메라 쪽), size(px 기준), brightness.
 * @param {{obj:[number,number], fitness?:number, dominated?:boolean}} g
 * @returns {{x:number,y:number,z:number,size:number,brightness:number}}
 */
export function genomeToParticle(g) {
  const [o0, o1] = g.obj;
  const fitness = g.fitness ?? 0;
  return {
    x: o0 * 2 - 1,
    y: o1 * 2 - 1,
    z: fitness * 1.5, // 적합도 높을수록 카메라 쪽
    size: 6 + fitness * 24, // px point size 기준
    brightness: fitness * (g.dominated ? DIM_PENALTY : 1),
  };
}

/**
 * 비지배(non-dominated) 유전자만, 첫 목적축 기준 오름차순 정렬해 반환.
 * 파레토 호(arc)를 그릴 정점 순서로 쓰인다.
 * @param {{genomes:Array}} gen
 */
export function paretoFront(gen) {
  return gen.genomes
    .filter((g) => !g.dominated)
    .sort((a, b) => a.obj[0] - b.obj[0]);
}

/**
 * 최대 fitness 유전자(챔피언)를 반환. 빈 세대는 null.
 * @param {{genomes:Array}} gen
 */
export function championOf(gen) {
  return gen.genomes.reduce(
    (best, g) => (g.fitness > (best?.fitness ?? -Infinity) ? g : best),
    null
  );
}
