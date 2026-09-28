// How an amount of money is written: "₹1,499.00", "$20.00".
//
// Nothing server-only here on purpose. Dashboard pages, automated messages and
// the agents' own instructions all quote prices, and they should all write the
// same price the same way — so this imports nothing and can be loaded anywhere,
// including by the always-on WhatsApp session manager under plain Node.

/** A money amount for a message: "₹1,499.00", "$20.00". */
export function formatMoney(amount: number | string, currency: string): string {
  const value = typeof amount === "string" ? Number(amount) : amount;

  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
