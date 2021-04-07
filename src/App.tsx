import {
  createContext,
  Dispatch,
  memo,
  useContext,
  useReducer,
  useRef,
} from "react"
import {
  initialCurrencyRates,
  formatCurrency,
  Order,
  NumberInput,
  formatPrice,
  initialOrders,
  Table,
  getBaseCurrencyPrice,
  getRandomOrder,
  uuidv4,
  isCurrecyRateValid,
} from "./utils"

const initialCurrencies = Object.keys(initialCurrencyRates)
const currenciesContext = createContext(initialCurrencies)
const useCurrencies = () => useContext(currenciesContext)
const { Provider: CurrenciesContextProvider } = currenciesContext

enum CurrencyRateState {
  ACCEPTED,
  DIRTY,
  IN_PROGRESS,
}

interface CurrencyRate {
  rate: number
  state: CurrencyRateState
  confirmedRate: number
}

const initialCurrencyRatesState = Object.fromEntries(
  Object.entries(initialCurrencyRates).map(
    ([id, rate]) =>
      [
        id,
        {
          rate,
          confirmedRate: rate,
          state: CurrencyRateState.ACCEPTED,
        },
      ] as [string, CurrencyRate],
  ),
)

const currencyRatesContext = createContext<
  [Record<string, CurrencyRate>, Dispatch<RatesAction>]
>([initialCurrencyRatesState, () => {}])
const useCurrencyRates = () => useContext(currencyRatesContext)
const { Provider: CurrencyRatesContextProvider } = currencyRatesContext

interface EditCurrencyRate {
  type: "EditCurrencyRate"
  payload: { id: string; rate: number }
}
interface StartIsValidRequest {
  type: "StartIsValidRequest"
  payload: string
}
interface IsValidResult {
  type: "IsValidResult"
  payload: { id: string; result: boolean }
}
type RatesAction = EditCurrencyRate | StartIsValidRequest | IsValidResult
function ratesReducer(prev: Record<string, CurrencyRate>, action: RatesAction) {
  switch (action.type) {
    case "EditCurrencyRate":
      return {
        ...prev,
        [action.payload.id]: {
          ...prev[action.payload.id],
          rate: action.payload.rate,
          state: CurrencyRateState.DIRTY,
        },
      }
    case "StartIsValidRequest":
      return {
        ...prev,
        [action.payload]: {
          ...prev[action.payload],
          state: CurrencyRateState.IN_PROGRESS,
        },
      }
    case "IsValidResult":
      const previousState = prev[action.payload.id]
      const newRate = action.payload.result
        ? previousState.rate
        : previousState.confirmedRate
      return {
        ...prev,
        [action.payload.id]: {
          ...previousState,
          state: CurrencyRateState.ACCEPTED,
          rate: newRate,
          confirmedRate: newRate,
        },
      }
  }
}

const CurrenciesProvider: React.FC = ({ children }) => {
  const [currencyRates, dispatch] = useReducer(
    ratesReducer,
    initialCurrencyRatesState,
  )
  const debouncedCall = useKeyedDebounce(async (id: string, rate: number) => {
    dispatch({ type: "StartIsValidRequest", payload: id })
    const result = await isCurrecyRateValid(id, rate)
    dispatch({ type: "IsValidResult", payload: { id, result } })
  })

  const effectDispatch: Dispatch<RatesAction> = (action) => {
    if (action.type === "EditCurrencyRate") {
      debouncedCall(action.payload.id, action.payload.rate)
    }
    return dispatch(action)
  }

  return (
    <CurrenciesContextProvider value={initialCurrencies}>
      <CurrencyRatesContextProvider value={[currencyRates, effectDispatch]}>
        {children}
      </CurrencyRatesContextProvider>
    </CurrenciesContextProvider>
  )
}

const useKeyedDebounce = <T extends (id: string, ...args: any[]) => void>(
  fn: T,
  timeout = 300,
): T => {
  const debounceStates = useRef<Record<string, any>>({})

  return ((id: string, ...args: any[]) => {
    if (debounceStates.current[id]) {
      clearTimeout(debounceStates.current[id])
    }

    debounceStates.current[id] = setTimeout(() => fn(id, ...args), timeout)
  }) as any
}

interface AddOrder {
  type: "Add"
  payload: Order
}
interface EditCurrency {
  type: "EditCurrency"
  payload: { id: string; value: string }
}
interface EditPrice {
  type: "EditPrice"
  payload: { id: string; value: number }
}
type OrdersAction = AddOrder | EditCurrency | EditPrice
function ordersReducer(prev: Record<string, Order>, action: OrdersAction) {
  switch (action.type) {
    case "Add":
      return { ...prev, [action.payload.id]: action.payload }
    case "EditPrice":
      return {
        ...prev,
        [action.payload.id]: {
          ...prev[action.payload.id],
          price: action.payload.value,
        },
      }
    case "EditCurrency":
      return {
        ...prev,
        [action.payload.id]: {
          ...prev[action.payload.id],
          currency: action.payload.value,
        },
      }
    default:
      return prev
  }
}

const ordersContext = createContext<
  [Record<string, Order>, React.Dispatch<OrdersAction>]
>([initialOrders, () => {}])
const useOrders = () => useContext(ordersContext)
const { Provider: OrdersContextProvider } = ordersContext

const OrdersProvider: React.FC = ({ children }) => {
  const orders = useReducer(ordersReducer, initialOrders)
  return (
    <OrdersContextProvider value={orders}>{children}</OrdersContextProvider>
  )
}

const CurrencyRateComponent: React.FC<{
  currency: string
  currencyRate: CurrencyRate
  setCurrencyRate: (id: string, rate: number) => void
}> = memo(({ currency, currencyRate, setCurrencyRate }) => {
  const isDisabled = currencyRate.state === CurrencyRateState.IN_PROGRESS
  const backgroundColor =
    currencyRate.state === CurrencyRateState.ACCEPTED ? "limegreen" : undefined

  return (
    <tr key={currency}>
      <td>{formatCurrency(currency)}</td>
      <td>
        <NumberInput
          value={currencyRate.rate}
          onChange={(value) => setCurrencyRate(currency, value)}
          style={{
            backgroundColor,
          }}
          disabled={isDisabled}
        />
      </td>
    </tr>
  )
})

const Currencies = () => {
  const [currencyRates, dispatch] = useCurrencyRates()
  return (
    <Table columns={["Currency", "Exchange rate"]}>
      {Object.entries(currencyRates).map(([currency, rate]) => (
        <CurrencyRateComponent
          key={currency}
          currency={currency}
          currencyRate={rate}
          setCurrencyRate={(id, rate) =>
            dispatch({ type: "EditCurrencyRate", payload: { id, rate } })
          }
        />
      ))}
    </Table>
  )
}

const CurrencySelector: React.FC<{
  value: string
  onChange: (next: string) => void
}> = ({ value, onChange }) => {
  const currencies = useCurrencies()
  return (
    <select
      onChange={(e) => {
        onChange(e.target.value)
      }}
      value={value}
    >
      {currencies.map((c) => (
        <option key={c} value={c}>
          {formatCurrency(c)}
        </option>
      ))}
    </select>
  )
}

const Orderline: React.FC<{
  order: Order
  currencyRate: number
  dispatch: Dispatch<OrdersAction>
}> = memo(({ order, currencyRate, dispatch }) => {
  const baseCurrencyPrice = getBaseCurrencyPrice(order.price, currencyRate)
  return (
    <tr>
      <td>{order.title}</td>
      <td>
        <NumberInput
          value={order.price}
          onChange={(value) => {
            dispatch({ type: "EditPrice", payload: { id: order.id, value } })
          }}
        />
      </td>
      <td>
        <CurrencySelector
          value={order.currency}
          onChange={(value) => {
            dispatch({ type: "EditCurrency", payload: { id: order.id, value } })
          }}
        />
      </td>
      <td>{formatPrice(baseCurrencyPrice)} £</td>
    </tr>
  )
})

const Orders = () => {
  const [orders, dispatch] = useOrders()
  const [currencyRates] = useCurrencyRates()
  return (
    <Table columns={["Article", "Price", "Currency", "Price in £"]}>
      {Object.entries(orders).map(([id, order]) => (
        <Orderline
          key={id}
          order={order}
          dispatch={dispatch}
          currencyRate={currencyRates[order.currency].confirmedRate}
        />
      ))}
    </Table>
  )
}

const AddOrderButton = () => {
  const [, dispatch] = useOrders()
  return (
    <button
      onClick={() => {
        dispatch({ type: "Add", payload: getRandomOrder(uuidv4()) })
      }}
    >
      Add
    </button>
  )
}

const OrderTotal = () => {
  const [orders] = useOrders()
  const [currencyRates] = useCurrencyRates()
  const total = Object.values(orders)
    .map((order) =>
      getBaseCurrencyPrice(
        order.price,
        currencyRates[order.currency].confirmedRate,
      ),
    )
    .reduce((a, b) => a + b, 0)
  return <div className="total">{formatPrice(total)} £</div>
}

const App = () => (
  <CurrenciesProvider>
    <OrdersProvider>
      <div className="App">
        <h1>Orders</h1>
        <Orders />
        <div className="actions">
          <AddOrderButton />
          <OrderTotal />
        </div>
        <h1>Exchange rates</h1>
        <Currencies />
      </div>
    </OrdersProvider>
  </CurrenciesProvider>
)

export default App
