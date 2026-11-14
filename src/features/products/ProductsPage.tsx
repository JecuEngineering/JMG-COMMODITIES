import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Chip, ChipRow } from '../../components/Chip'
import { DateInput } from '../../components/DateInput'
import { Field, SelectInput, TextInput } from '../../components/Field'
import { SkeletonTable } from '../../components/Loading'
import { Modal } from '../../components/Modal'
import { Pagination, usePaged } from '../../components/Pagination'
import { Table } from '../../components/Table'
import { useAuth } from '../auth/AuthContext'
import { formatDate, todayInputValue } from '../../lib/dates'
import { downloadCsv } from '../../lib/export'
import { formatPhp, parseMoneyInput } from '../../lib/money'
import { canManagePrices, canManageProducts, canViewProducts } from '../../lib/roles'
import { supabase } from '../../lib/supabase'
import type { Price, SackSize, Sku, Variety, VarietyOrigin } from '../../types/database'

const SACK_SIZES: SackSize[] = [5, 25, 50]

function currentPrice(prices: Price[], skuId: string, onDate = todayInputValue()): Price | null {
  const applicable = prices
    .filter((p) => p.sku_id === skuId && p.effective_from <= onDate)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))
  return applicable[0] ?? null
}

export function ProductsPage() {
  const { user } = useAuth()
  const role = user!.profile.role
  const canView = canViewProducts(role)
  const canEditProducts = canManageProducts(role)
  const canEditPrices = canManagePrices(role)

  const [varieties, setVarieties] = useState<Variety[]>([])
  const [skus, setSkus] = useState<Sku[]>([])
  const [prices, setPrices] = useState<Price[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [varietyName, setVarietyName] = useState('')
  const [varietyOrigin, setVarietyOrigin] = useState<VarietyOrigin>('local')
  const [selectedVarietyId, setSelectedVarietyId] = useState<string>('')
  const [skuSize, setSkuSize] = useState<SackSize>(25)
  const [skuBarcode, setSkuBarcode] = useState('')
  const [varietyOpen, setVarietyOpen] = useState(false)
  const [skuOpen, setSkuOpen] = useState(false)
  const [priceOpen, setPriceOpen] = useState(false)

  const [priceSkuId, setPriceSkuId] = useState('')
  const [priceAmount, setPriceAmount] = useState('')
  const [priceEffectiveFrom, setPriceEffectiveFrom] = useState(todayInputValue())
  const [historySkuId, setHistorySkuId] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    const [vRes, sRes, pRes] = await Promise.all([
      supabase.from('varieties').select('*').is('deleted_at', null).order('name'),
      supabase.from('skus').select('*, variety:varieties(*)').is('deleted_at', null).order('sack_size'),
      supabase
        .from('prices')
        .select('*, set_by_profile:profiles!set_by(id, full_name)')
        .order('effective_from', { ascending: false }),
    ])

    if (vRes.error || sRes.error || pRes.error) {
      setError(vRes.error?.message || sRes.error?.message || pRes.error?.message || 'Failed to load')
    } else {
      setError(null)
      setVarieties((vRes.data as Variety[]) ?? [])
      setSkus((sRes.data as Sku[]) ?? [])
      setPrices((pRes.data as Price[]) ?? [])
      if (vRes.data?.[0]) {
        setSelectedVarietyId((prev) => prev || (vRes.data as Variety[])[0].id)
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (canView) void load()
  }, [canView, load])

  const skusForSelected = useMemo(
    () => skus.filter((s) => s.variety_id === selectedVarietyId),
    [skus, selectedVarietyId],
  )

  const priceHistory = useMemo(
    () => prices.filter((p) => p.sku_id === historySkuId),
    [prices, historySkuId],
  )

  const skuPager = usePaged(skus, 10)

  function exportSkus() {
    downloadCsv(
      `sku-list-${todayInputValue()}.csv`,
      ['Variety', 'Sack size (kg)', 'Barcode', 'Current price', 'Effective from'],
      skusForSelected.map((sku) => {
        const price = currentPrice(prices, sku.id)
        return [
          sku.variety?.name ?? '',
          sku.sack_size,
          sku.barcode ?? '',
          price ? price.price : '',
          price ? price.effective_from : '',
        ]
      }),
    )
  }

  if (!canView) {
    return (
      <div className="app-page">
        <div className="error-banner">You do not have access to products and prices.</div>
      </div>
    )
  }

  async function addVariety(event: FormEvent) {
    event.preventDefault()
    if (!canEditProducts) return
    setError(null)
    setMessage(null)
    const { data, error: insertError } = await supabase
      .from('varieties')
      .insert({ name: varietyName.trim(), origin: varietyOrigin, active: true })
      .select('*')
      .single()
    if (insertError) {
      setError(insertError.message)
      return
    }
    setVarietyName('')
    setVarietyOpen(false)
    setMessage(`Variety “${data.name}” added.`)
    await load()
  }

  async function addSku(event: FormEvent) {
    event.preventDefault()
    if (!canEditProducts || !selectedVarietyId) return
    setError(null)
    setMessage(null)
    const { error: insertError } = await supabase.from('skus').insert({
      variety_id: selectedVarietyId,
      sack_size: skuSize,
      barcode: skuBarcode.trim() || null,
      active: true,
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setSkuBarcode('')
    setSkuOpen(false)
    setMessage(`SKU ${skuSize}kg created.`)
    await load()
  }

  async function setPrice(event: FormEvent) {
    event.preventDefault()
    if (!canEditPrices || !priceSkuId) return
    const amount = parseMoneyInput(priceAmount)
    if (amount === null) {
      setError('Enter a valid price.')
      return
    }
    setError(null)
    setMessage(null)

    const { error: insertError } = await supabase.from('prices').insert({
      sku_id: priceSkuId,
      price: amount.toFixed(2),
      effective_from: priceEffectiveFrom,
      set_by: user!.id,
    })

    if (insertError) {
      setError(insertError.message)
      return
    }

    setPriceAmount('')
    setPriceOpen(false)
    setMessage('New price saved. Old sales keep their old price because prices are history rows.')
    setHistorySkuId(priceSkuId)
    await load()
  }

  async function softDeactivateVariety(variety: Variety) {
    if (!canEditProducts) return
    const { error: updateError } = await supabase
      .from('varieties')
      .update({ active: false, deleted_at: new Date().toISOString() })
      .eq('id', variety.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setMessage(`${variety.name} deactivated.`)
    await load()
  }

  return (
    <div className="app-page stack">
      <div className="page-header">
        <div>
          <h1>Products & Prices</h1>
          <p>Varieties, sack-size SKUs, and dated price list. Changing a price never rewrites old sales.</p>
        </div>
      </div>

      {error && !varietyOpen && !skuOpen && !priceOpen ? (
        <div className="error-banner">{error}</div>
      ) : null}
      {message ? <div className="success-banner">{message}</div> : null}
      {loading ? <SkeletonTable rows={4} cols={4} /> : null}

      <Card
        title="Rice varieties"
        subtitle="Kasikas Jasmine, Japonica, White, Parboiled, Glutinous"
        action={canEditProducts ? <Button onClick={() => setVarietyOpen(true)}>Add variety</Button> : null}
      >
        <Modal
          open={varietyOpen}
          onClose={() => setVarietyOpen(false)}
          title="New variety"
          subtitle="Add a rice variety to the price list."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setVarietyOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="variety-form">
                Add variety
              </Button>
            </>
          }
        >
          <form id="variety-form" className="stack" onSubmit={addVariety}>
            {error ? <div className="error-banner">{error}</div> : null}
            <div className="stack">
              <div>
                <Field label="Variety name" htmlFor="variety-name">
                  <TextInput
                    id="variety-name"
                    required
                    value={varietyName}
                    onChange={(e) => setVarietyName(e.target.value)}
                    placeholder="Kasikas Jasmine"
                  />
                </Field>
              </div>
              <div>
                <Field label="Origin" htmlFor="variety-origin">
                  <SelectInput
                    id="variety-origin"
                    value={varietyOrigin}
                    onChange={(e) => setVarietyOrigin(e.target.value as VarietyOrigin)}
                  >
                    <option value="local">Local</option>
                    <option value="imported">Imported</option>
                  </SelectInput>
                </Field>
              </div>
            </div>
          </form>
        </Modal>

        <ChipRow>
          {varieties.map((v) => (
            <Chip key={v.id} active={selectedVarietyId === v.id} onClick={() => setSelectedVarietyId(v.id)}>
              {v.name}
            </Chip>
          ))}
        </ChipRow>

        {selectedVarietyId ? (
          <div className="stack" style={{ marginTop: 16 }}>
            {varieties
              .filter((v) => v.id === selectedVarietyId)
              .map((v) => (
                <div key={v.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong>{v.name}</strong>
                    <div className="muted">
                      {v.origin === 'imported' ? 'Imported' : 'Local'} · {v.active ? 'Active' : 'Inactive'}
                    </div>
                  </div>
                  {canEditProducts && v.active ? (
                    <Button variant="danger" onClick={() => void softDeactivateVariety(v)}>
                      Deactivate
                    </Button>
                  ) : null}
                </div>
              ))}
          </div>
        ) : (
          <div className="empty-state" style={{ marginTop: 16 }}>
            No varieties yet. Seed data or add one above.
          </div>
        )}
      </Card>

      <Card
        title="SKUs (sack sizes)"
        subtitle="5kg · 25kg · 50kg with optional barcode"
        action={
          <div className="row">
            {skusForSelected.length > 0 ? (
              <Button variant="secondary" onClick={exportSkus}>
                Export CSV
              </Button>
            ) : null}
            {canEditProducts && selectedVarietyId ? (
              <Button onClick={() => setSkuOpen(true)}>Add SKU</Button>
            ) : null}
          </div>
        }
      >
        <Modal
          open={skuOpen}
          onClose={() => setSkuOpen(false)}
          title="New SKU"
          subtitle="Sack size for the selected variety."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setSkuOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="sku-form">
                Add SKU
              </Button>
            </>
          }
        >
          <form id="sku-form" className="stack" onSubmit={addSku}>
            {error ? <div className="error-banner">{error}</div> : null}
            <Field label="Sack size" htmlFor="sku-size">
              <ChipRow>
                {SACK_SIZES.map((size) => (
                  <Chip key={size} active={skuSize === size} onClick={() => setSkuSize(size)}>
                    {size} kg
                  </Chip>
                ))}
              </ChipRow>
            </Field>
            <div>
              <div>
                <Field label="Barcode" htmlFor="sku-barcode" hint="Optional · POS-ready">
                  <TextInput
                    id="sku-barcode"
                    value={skuBarcode}
                    onChange={(e) => setSkuBarcode(e.target.value)}
                    placeholder="KAS-25KG"
                  />
                </Field>
              </div>
            </div>
            <input id="sku-size" className="sr-only" readOnly value={skuSize} />
          </form>
        </Modal>

        {skusForSelected.length === 0 ? (
          <div className="empty-state">No SKUs for this variety yet.</div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Variety</th>
                <th>Sack</th>
                <th>Barcode</th>
                <th>Current price</th>
                <th>Effective</th>
              </tr>
            </thead>
            <tbody>
              {skusForSelected.map((sku) => {
                const price = currentPrice(prices, sku.id)
                return (
                  <tr key={sku.id}>
                    <td>{sku.variety?.name ?? '—'}</td>
                    <td>{sku.sack_size} kg</td>
                    <td>{sku.barcode ?? '—'}</td>
                    <td>
                      {price ? formatPhp(price.price) : <Badge tone="warning">No price</Badge>}
                    </td>
                    <td>{price ? formatDate(price.effective_from) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card
        title="Price list"
        subtitle={
          canEditPrices
            ? 'Owner and General Accountant can set prices. Inserts a new dated row.'
            : 'View only for your role'
        }
        action={canEditPrices ? <Button onClick={() => setPriceOpen(true)}>Set price</Button> : null}
      >
        <Modal
          open={priceOpen}
          onClose={() => setPriceOpen(false)}
          title="Set new price"
          subtitle="Saved as a new dated row; past sales keep their old price."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setPriceOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="price-form">
                Set price
              </Button>
            </>
          }
        >
          <form id="price-form" className="stack" onSubmit={setPrice}>
            {error ? <div className="error-banner">{error}</div> : null}
            <Field label="SKU" htmlFor="price-sku">
              <SelectInput
                id="price-sku"
                required
                value={priceSkuId}
                onChange={(e) => setPriceSkuId(e.target.value)}
              >
                <option value="">Select SKU</option>
                {skus.map((sku) => (
                  <option key={sku.id} value={sku.id}>
                    {sku.variety?.name ?? 'Variety'} · {sku.sack_size}kg
                  </option>
                ))}
              </SelectInput>
            </Field>
            <div>
              <div>
                <Field label="Price per sack (₱)" htmlFor="price-amount">
                  <TextInput
                    id="price-amount"
                    required
                    inputMode="decimal"
                    value={priceAmount}
                    onChange={(e) => setPriceAmount(e.target.value)}
                    placeholder="1450.00"
                  />
                </Field>
              </div>
              <div>
                <Field label="Effective from" htmlFor="price-from">
                  <DateInput id="price-from" value={priceEffectiveFrom} onChange={setPriceEffectiveFrom} />
                </Field>
              </div>
            </div>
          </form>
        </Modal>

        <Table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Current price</th>
              <th>Effective from</th>
              <th>History</th>
            </tr>
          </thead>
          <tbody>
            {skuPager.pageItems.map((sku) => {
              const price = currentPrice(prices, sku.id)
              return (
                <tr key={sku.id}>
                  <td>
                    {sku.variety?.name ?? '—'} · {sku.sack_size}kg
                  </td>
                  <td>{price ? formatPhp(price.price) : '—'}</td>
                  <td>{price ? formatDate(price.effective_from) : '—'}</td>
                  <td>
                    <Button
                      variant="ghost"
                      onClick={() => setHistorySkuId(sku.id === historySkuId ? '' : sku.id)}
                    >
                      {sku.id === historySkuId ? 'Hide' : 'View'}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
        <Pagination
          page={skuPager.page}
          pageCount={skuPager.pageCount}
          pageSize={skuPager.pageSize}
          total={skuPager.total}
          start={skuPager.start}
          end={skuPager.end}
          onPage={skuPager.setPage}
          onPageSize={skuPager.setPageSize}
          noun="SKU"
        />

        {historySkuId ? (
          <div className="stack" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: '1rem' }}>Price history</h3>
            <p className="muted">
              Older rows stay forever so past sales keep the price that was effective on sale date.
            </p>
            {priceHistory.length === 0 ? (
              <div className="empty-state">No price history for this SKU.</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Effective from</th>
                    <th>Price</th>
                    <th>Set by</th>
                    <th>Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {priceHistory.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.effective_from)}</td>
                      <td>{formatPhp(p.price)}</td>
                      <td>{p.set_by_profile?.full_name ?? '—'}</td>
                      <td>{formatDate(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  )
}
