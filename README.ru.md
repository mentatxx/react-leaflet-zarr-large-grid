# react-leaflet-zarr-large-grid

Слой React Leaflet, который рисует регулярный двумерный float-массив Zarr как тепловую карту. Тайлы строятся для видимой области и буфера тайлов Leaflet. Декодируются только чанки Zarr, которые эти тайлы пересекают.

Основная документация на английском: [README.md](README.md).

## Установка

```bash
npm install react-leaflet-zarr-large-grid leaflet react react-dom react-leaflet
```

Peer-зависимости: `leaflet@^1.9.0` (последний совместимый выпуск — 1.9.4; Leaflet 2 не поддерживается react-leaflet 5), `react@^19`, `react-dom@^19`, `react-leaflet@^5`. Пакет зависит от `zarrita@^0.7.5`.

## Пример

```tsx
import { MapContainer, TileLayer } from "react-leaflet";
import { ReactLeafletZarrGridLayer } from "react-leaflet-zarr-large-grid";

<MapContainer center={[48.7, 37.6]} zoom={15}>
  <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
  <ReactLeafletZarrGridLayer
    store="https://example.com/field.zarr"
    path="yield"
    bounds={() => ({ west: 37.55, south: 48.7, east: 37.58, north: 48.72 })}
    cellSize={() => ({ width: 20, height: 20 })}
    palette={(value) => (value > 5 ? "#2e8b57" : "#d35400")}
    pixelSampling="nearest"
  />
</MapContainer>
```

`store` — URL (`FetchStore`) или любой читаемый store zarrita. `path` выбирает массив внутри группы. Если корень store уже является массивом, `path` не нужен.

`bounds` и `cellSize` — геттеры актуальных значений. Слой вызывает их в момент отрисовки тайла. Стабильные значения мемоизируйте через `useCallback`: новая ссылка на функцию перерисовывает тайлы. От зума эти функции не зависят.

`palette(value)` возвращает `#rrggbb`. Пороги и диапазоны остаются в вашей функции. `NaN` и `fill_value` массива в палитру не передаются и остаются прозрачными. Любая другая строка тоже рисуется прозрачной.

## Координаты

Значения лежат на регулярной сетке. Ось 0 идёт с севера на юг, ось 1 — с запада на восток. Ячейка `(0, 0)` примыкает к северо-западному углу `bounds`.

`bounds` — прямоугольник WGS84 в градусах. `cellSize.width` — размер ячейки запад—восток в метрах, `cellSize.height` — север—юг в метрах. Перевод в градусы — равнопромежуточный, на широте центра `bounds` (`111320` метров на градус широты). Для поля этого достаточно, для континентальной сетки — нет. Сетка выровнена по осям широты и долготы: без поворота и без пересечения антимеридиана.

Края ячеек откладываются от северо-западного угла по `cellSize` и не растягиваются до юго-восточного угла. Если этот угол расходится с `rows * height` и `cols * width` больше чем на одну ячейку, слой один раз пишет предупреждение в консоль.

## Выборка пикселя

`pixelSampling` задаёт поведение, когда в пиксель попадает несколько ячеек:

- `nearest` (по умолчанию) берёт ячейку под центром пикселя. Один отсчёт на пиксель.
- `average` усредняет конечные значения ячеек, которые покрывает пиксель, и один раз вызывает палитру.

Декодированные чанки лежат в LRU-кэше (`chunkCacheSize`, по умолчанию 128), общем для всех тайлов, включая кольцо `keepBuffer` (по умолчанию 2). Уход тайла с карты отменяет его отрисовку. Загрузка чанка отменяется только если он больше не нужен ни одному тайлу.

## Пропсы

| Проп | Тип | По умолчанию |
| --- | --- | --- |
| `store` | `string` или читаемый store zarrita | обязательный |
| `path` | `string` | корень store |
| `bounds` | `() => { west, south, east, north }` | обязательный |
| `cellSize` | `() => { width, height }` в метрах | обязательный |
| `palette` | `(value: number) => string` | обязательный |
| `pixelSampling` | `"nearest"` или `"average"` | `"nearest"` |
| `keepBuffer` | `number` | `2` |
| `opacity` | `number` | значение Leaflet |
| `zIndex` | `number` | значение Leaflet |
| `pane` | `string` | `"overlayPane"` |
| `chunkCacheSize` | `number` | `128` |
| `onError` | `(error: unknown) => void` |  |

Массив должен быть двумерным `float32` или `float64`. Ошибки открытия и неверный dtype или форма приходят в `onError`. Ошибка чтения тайла уходит в `done(error)` Leaflet, чтобы карта могла повторить загрузку.

`ZarrGridLayer` экспортируется отдельно, без React-обёртки. `createGridFrame` и `gridFootprint` строят прямоугольник, совпадающий с метровой сеткой. Демо использует их.

## Демо

Из этого репозитория, Node.js 22.12 или новее:

```bash
npm install
npm run demo
```

Демо собирает синусоидальную волну в памяти и красит её статичной радужной палитрой. Панель переключает `pixelSampling`.

## Разработка

```bash
npm test
npm run build
```

Публикуемый пакет — ESM и декларации TypeScript (`dist`). В разработке стоит TypeScript 5.9: TypeScript 7 не отдаёт API компилятора, без которого `tsup` не собирает `.d.ts`. GitHub Actions на Node 22 запускает тесты, сборку библиотеки и сборку демо.

## Ограничения

Нет поворота сетки, оси времени или высоты, пирамид по зуму, обводки ячеек и CRS кроме WGS84. react-leaflet 4 не поддерживается.
