import { titleCase } from '../../utils/format.js'

/**
 * The <option>s of a field dropdown, grouped by farm: a farm with several crops is one group
 * listing every crop on it, a farm with one crop is a single option. `note(fieldId)` returns text
 * to append to an option (pending work, retest due...).
 */
export default function PlotOptions({ plots, note = () => '' }) {
  const groups = []
  for (const plot of plots) {
    const group = groups.find((g) => String(g.farm.id) === String(plot.farm.id))
    if (group) group.fields.push(plot.field)
    else groups.push({ farm: plot.farm, fields: [plot.field] })
  }

  return groups.map(({ farm, fields }) =>
    fields.length > 1 ? (
      <optgroup key={farm.id} label={farm.name}>
        {fields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.cropType ? titleCase(f.cropType) : f.name}
            {note(f.id)}
          </option>
        ))}
      </optgroup>
    ) : (
      <option key={fields[0].id} value={fields[0].id}>
        {fields[0].name}
        {fields[0].cropType ? ` (${titleCase(fields[0].cropType)})` : ''}
        {note(fields[0].id)}
      </option>
    ),
  )
}
