/** A tap on card `i` in a pick of up to `max` cards: untaps it if picked; with a single pick, the
 *  tap moves the pick to this card; otherwise it adds the card while there is room. */
export function toggleIndex(selected: number[], i: number, max: number): number[] {
  if (selected.includes(i)) return selected.filter(x => x !== i)
  if (max === 1) return [i]
  return selected.length < max ? [...selected, i] : selected
}
