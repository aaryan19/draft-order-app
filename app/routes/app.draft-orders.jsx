import { useState, useCallback, useEffect } from "react";
import { useActionData, useLoaderData, useFetcher, Form } from "react-router";
import { authenticate } from "../shopify.server";

// ─── LOADER ──────────────────────────────────────────────────────────────────
export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const customerQuery = url.searchParams.get("customerQuery") || "";
  const productQuery = url.searchParams.get("productQuery") || "";
  const intent = url.searchParams.get("intent");

  if (intent === "searchCustomers") {
    const res = await admin.graphql(
      `query searchCustomers($query: String!) {
        customers(first: 10, query: $query) {
          edges {
            node {
              id
              displayName
              email
              phone
              defaultAddress {
                address1
                city
                country
              }
            }
          }
        }
      }`,
      { variables: { query: customerQuery || "a" } }
    );
    const data = await res.json();
    return { customers: data.data?.customers?.edges?.map((e) => e.node) ?? [], intent: "searchCustomers" };
  }

  if (intent === "searchProducts") {
    const res = await admin.graphql(
      `query searchProducts($query: String!) {
        products(first: 10, query: $query) {
          edges {
            node {
              id
              title
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price
                    sku
                    inventoryQuantity
                  }
                }
              }
            }
          }
        }
      }`,
      { variables: { query: productQuery || "*" } }
    );
    const data = await res.json();
    return { products: data.data?.products?.edges?.map((e) => e.node) ?? [], intent: "searchProducts" };
  }

  return { customers: [], products: [], intent: null };
}

// ─── ACTION ───────────────────────────────────────────────────────────────────
export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const customerId = formData.get("customerId");
  const email = formData.get("email");
  const note = formData.get("note");
  const discountValue = formData.get("discountValue");
  const discountType = formData.get("discountType");

  // Parse line items
  const lineItemsRaw = formData.get("lineItems");
  const lineItems = JSON.parse(lineItemsRaw || "[]");

  // Parse note attributes
  const noteAttributesRaw = formData.get("noteAttributes");
  const noteAttributesParsed = JSON.parse(noteAttributesRaw || "[]");
  const noteAttributes = noteAttributesParsed
    .filter((a) => a.name && a.value)
    .map((a) => ({ name: a.name, value: a.value }));

  // Build line items for GraphQL
  const gqlLineItems = lineItems.map((item) => {
    if (item.type === "variant") {
      return {
        variantId: item.variantId,
        quantity: item.quantity,
      };
    } else {
      // Custom line item
      return {
        title: item.title,
        quantity: item.quantity,
        originalUnitPrice: item.price,
        requiresShipping: item.requiresShipping ?? true,
        taxable: item.taxable ?? true,
        ...(item.sku ? { sku: item.sku } : {}),
      };
    }
  });

  const input = {
    ...(customerId ? { customerId } : {}),
    ...(email && !customerId ? { email } : {}),
    lineItems: gqlLineItems,
    note: note || "",
    ...(noteAttributes.length > 0 ? { customAttributes: noteAttributes } : {}),
    ...(discountValue && parseFloat(discountValue) > 0
      ? {
          appliedDiscount: {
            title: "App Discount",
            description: "Custom discount from app",
            value: parseFloat(discountValue),
            valueType: discountType === "FIXED_AMOUNT" ? "FIXED_AMOUNT" : "PERCENTAGE",
          },
        }
      : {}),
  };

  const response = await admin.graphql(
    `mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          name
          invoiceUrl
          totalPrice
        }
        userErrors {
          field
          message
        }
      }
    }`,
    { variables: { input } }
  );

  const result = await response.json();
  return result;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, children, accent }) {
  return (
    <div style={{
      background: "var(--card-bg)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      overflow: "hidden",
      marginBottom: "20px",
    }}>
      <div style={{
        padding: "16px 20px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        background: "var(--card-header-bg)",
      }}>
        {accent && (
          <span style={{
            width: "4px",
            height: "20px",
            borderRadius: "2px",
            background: accent,
            flexShrink: 0,
          }} />
        )}
        <div>
          <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-primary)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding: "20px" }}>{children}</div>
    </div>
  );
}

function SearchInput({ value, onChange, placeholder, loading }) {
  return (
    <div style={{ position: "relative" }}>
      <span style={{
        position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
        color: "var(--text-secondary)", fontSize: "16px", pointerEvents: "none",
      }}>🔍</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "10px 12px 10px 38px",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          fontSize: "14px",
          background: "var(--input-bg)",
          color: "var(--text-primary)",
          outline: "none",
          boxSizing: "border-box",
          transition: "border-color 0.15s",
        }}
        onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
        onBlur={(e) => e.target.style.borderColor = "var(--border)"}
      />
      {loading && (
        <span style={{
          position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
          color: "var(--text-secondary)", fontSize: "12px",
        }}>⏳</span>
      )}
    </div>
  );
}

function CustomerSection({ selectedCustomer, onSelect }) {
  const fetcher = useFetcher();
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);

  const customers = fetcher.data?.intent === "searchCustomers" ? fetcher.data.customers : [];
  const loading = fetcher.state === "loading";

  useEffect(() => {
    if (query.length < 1) { setShowResults(false); return; }
    setShowResults(true);
    const t = setTimeout(() => {
      fetcher.load(`?intent=searchCustomers&customerQuery=${encodeURIComponent(query)}`);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <SectionCard title="Customer" subtitle="Search and select an existing customer" accent="#5c6ac4">
      {selectedCustomer ? (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px",
          background: "var(--selected-bg)",
          border: "1px solid var(--accent)",
          borderRadius: "8px",
        }}>
          <div>
            <div style={{ fontWeight: "600", fontSize: "14px", color: "var(--text-primary)" }}>
              {selectedCustomer.displayName}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
              {selectedCustomer.email}
              {selectedCustomer.defaultAddress?.city && ` · ${selectedCustomer.defaultAddress.city}, ${selectedCustomer.defaultAddress.country}`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            style={{
              background: "none", border: "1px solid var(--border)",
              borderRadius: "6px", padding: "4px 10px",
              fontSize: "12px", cursor: "pointer", color: "var(--text-secondary)",
            }}
          >
            Remove
          </button>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by name, email, or phone..."
            loading={loading}
          />
          {showResults && customers.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
              background: "var(--card-bg)", border: "1px solid var(--border)",
              borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
              marginTop: "4px", maxHeight: "280px", overflowY: "auto",
            }}>
              {customers.map((c) => (
                <div
                  key={c.id}
                  onClick={() => { onSelect(c); setQuery(""); setShowResults(false); }}
                  style={{
                    padding: "10px 14px", cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-bg)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ fontWeight: "600", fontSize: "13px", color: "var(--text-primary)" }}>{c.displayName}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    {c.email}{c.defaultAddress?.city ? ` · ${c.defaultAddress.city}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
          {showResults && !loading && customers.length === 0 && query.length > 1 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
              background: "var(--card-bg)", border: "1px solid var(--border)",
              borderRadius: "8px", marginTop: "4px", padding: "14px",
              fontSize: "13px", color: "var(--text-secondary)", textAlign: "center",
            }}>
              No customers found for "{query}"
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function ProductsSection({ lineItems, onLineItemsChange }) {
  const fetcher = useFetcher();
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customItem, setCustomItem] = useState({ title: "", price: "", quantity: 1, sku: "", requiresShipping: true, taxable: true });

  const products = fetcher.data?.intent === "searchProducts" ? fetcher.data.products : [];
  const loading = fetcher.state === "loading";

  useEffect(() => {
    setShowResults(true);
    const t = setTimeout(() => {
      fetcher.load(`?intent=searchProducts&productQuery=${encodeURIComponent(query || "*")}`);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  function addVariant(product, variant) {
    const existing = lineItems.find((li) => li.type === "variant" && li.variantId === variant.id);
    if (existing) {
      onLineItemsChange(lineItems.map((li) =>
        li.type === "variant" && li.variantId === variant.id
          ? { ...li, quantity: li.quantity + 1 }
          : li
      ));
    } else {
      onLineItemsChange([...lineItems, {
        id: uid(),
        type: "variant",
        variantId: variant.id,
        productTitle: product.title,
        variantTitle: variant.title !== "Default Title" ? variant.title : "",
        price: parseFloat(variant.price),
        sku: variant.sku,
        quantity: 1,
      }]);
    }
    setShowResults(false);
    setQuery("");
  }

  function addCustomItem() {
    if (!customItem.title || !customItem.price) return;
    onLineItemsChange([...lineItems, {
      id: uid(),
      type: "custom",
      title: customItem.title,
      price: parseFloat(customItem.price),
      quantity: parseInt(customItem.quantity) || 1,
      sku: customItem.sku,
      requiresShipping: customItem.requiresShipping,
      taxable: customItem.taxable,
    }]);
    setCustomItem({ title: "", price: "", quantity: 1, sku: "", requiresShipping: true, taxable: true });
    setShowCustomForm(false);
  }

  function updateQty(id, qty) {
    if (qty < 1) {
      onLineItemsChange(lineItems.filter((li) => li.id !== id));
    } else {
      onLineItemsChange(lineItems.map((li) => li.id === id ? { ...li, quantity: qty } : li));
    }
  }

  const totalItems = lineItems.reduce((sum, li) => sum + li.quantity, 0);
  const subtotal = lineItems.reduce((sum, li) => sum + li.price * li.quantity, 0);

  return (
    <SectionCard title="Products" subtitle={`${lineItems.length} item type(s) · ${totalItems} total units`} accent="#47c1bf">
      {/* Search */}
      <div style={{ position: "relative", marginBottom: "16px" }}>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search products by title, SKU..."
          loading={loading}
        />
        {showResults && products.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
            background: "var(--card-bg)", border: "1px solid var(--border)",
            borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            marginTop: "4px", maxHeight: "320px", overflowY: "auto",
          }}>
            {products.map((p) => (
              <div key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <div style={{ padding: "8px 14px 4px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  {p.title}
                </div>
                {p.variants.edges.map(({ node: v }) => (
                  <div
                    key={v.id}
                    onClick={() => addVariant(p, v)}
                    style={{
                      padding: "8px 14px 8px 24px", cursor: "pointer",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-bg)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <div>
                      <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                        {v.title !== "Default Title" ? v.title : "Default"}
                      </span>
                      {v.sku && <span style={{ fontSize: "11px", color: "var(--text-secondary)", marginLeft: "8px" }}>SKU: {v.sku}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>${v.price}</span>
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Qty: {v.inventoryQuantity ?? "∞"}</span>
                      <span style={{ fontSize: "11px", color: "var(--accent)", fontWeight: "600" }}>+ Add</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Line items list */}
      {lineItems.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto auto",
            gap: "8px",
            alignItems: "center",
            padding: "6px 0",
            borderBottom: "1px solid var(--border)",
            fontSize: "11px",
            fontWeight: "700",
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}>
            <span>Item</span>
            <span style={{ textAlign: "right" }}>Price</span>
            <span style={{ textAlign: "center" }}>Qty</span>
            <span style={{ textAlign: "right" }}>Total</span>
          </div>
          {lineItems.map((li) => (
            <div key={li.id} style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto auto",
              gap: "8px",
              alignItems: "center",
              padding: "10px 0",
              borderBottom: "1px solid var(--border)",
            }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>
                  {li.type === "variant" ? li.productTitle : li.title}
                  {li.type === "custom" && (
                    <span style={{
                      marginLeft: "6px", fontSize: "10px", padding: "2px 6px",
                      background: "var(--tag-bg)", borderRadius: "4px", color: "var(--text-secondary)",
                    }}>custom</span>
                  )}
                </div>
                {(li.variantTitle || li.sku) && (
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {li.variantTitle}{li.sku ? ` · ${li.sku}` : ""}
                  </div>
                )}
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", textAlign: "right" }}>
                ${li.price?.toFixed(2)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => updateQty(li.id, li.quantity - 1)}
                  style={qtyBtnStyle}
                >−</button>
                <span style={{ fontSize: "13px", fontWeight: "600", minWidth: "20px", textAlign: "center", color: "var(--text-primary)" }}>
                  {li.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => updateQty(li.id, li.quantity + 1)}
                  style={qtyBtnStyle}
                >+</button>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-primary)" }}>
                  ${(li.price * li.quantity).toFixed(2)}
                </div>
                <button
                  type="button"
                  onClick={() => onLineItemsChange(lineItems.filter((x) => x.id !== li.id))}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#dc3545", padding: 0 }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <div style={{ textAlign: "right", padding: "10px 0 0", fontSize: "13px", color: "var(--text-secondary)" }}>
            Subtotal: <strong style={{ color: "var(--text-primary)" }}>${subtotal.toFixed(2)}</strong>
          </div>
        </div>
      )}

      {/* Custom item toggle */}
      <button
        type="button"
        onClick={() => setShowCustomForm(!showCustomForm)}
        style={{
          background: "none",
          border: "1px dashed var(--border)",
          borderRadius: "8px",
          padding: "10px 16px",
          width: "100%",
          fontSize: "13px",
          color: "var(--text-secondary)",
          cursor: "pointer",
          transition: "all 0.15s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
      >
        ＋ Add custom item
      </button>

      {showCustomForm && (
        <div style={{
          marginTop: "12px",
          padding: "16px",
          background: "var(--inset-bg)",
          borderRadius: "8px",
          border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: "13px", fontWeight: "700", marginBottom: "12px", color: "var(--text-primary)" }}>
            Custom Line Item
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Item name *</label>
              <input
                type="text"
                value={customItem.title}
                onChange={(e) => setCustomItem({ ...customItem, title: e.target.value })}
                placeholder="e.g. Custom Engraving"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Price *</label>
              <input
                type="number"
                value={customItem.price}
                onChange={(e) => setCustomItem({ ...customItem, price: e.target.value })}
                placeholder="0.00"
                min="0"
                step="0.01"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Quantity</label>
              <input
                type="number"
                value={customItem.quantity}
                onChange={(e) => setCustomItem({ ...customItem, quantity: e.target.value })}
                min="1"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>SKU (optional)</label>
              <input
                type="text"
                value={customItem.sku}
                onChange={(e) => setCustomItem({ ...customItem, sku: e.target.value })}
                placeholder="CUSTOM-001"
                style={inputStyle}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", justifyContent: "flex-end" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-primary)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={customItem.requiresShipping}
                  onChange={(e) => setCustomItem({ ...customItem, requiresShipping: e.target.checked })}
                />
                Requires shipping
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-primary)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={customItem.taxable}
                  onChange={(e) => setCustomItem({ ...customItem, taxable: e.target.checked })}
                />
                Taxable
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" onClick={addCustomItem} style={primaryBtnStyle}>
              Add Item
            </button>
            <button type="button" onClick={() => setShowCustomForm(false)} style={secondaryBtnStyle}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function DiscountSection({ discount, onChange }) {
  return (
    <SectionCard title="Discount" subtitle="Apply an order-level discount (optional)" accent="#f49342">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div>
          <label style={labelStyle}>Discount value</label>
          <input
            type="number"
            value={discount.value}
            onChange={(e) => onChange({ ...discount, value: e.target.value })}
            placeholder="0"
            min="0"
            step="0.01"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Discount type</label>
          <select
            value={discount.type}
            onChange={(e) => onChange({ ...discount, type: e.target.value })}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value="PERCENTAGE">Percentage (%)</option>
            <option value="FIXED_AMOUNT">Fixed Amount ($)</option>
          </select>
        </div>
      </div>
    </SectionCard>
  );
}

function NoteAttributesSection({ attributes, onChange }) {
  function addAttr() {
    onChange([...attributes, { id: uid(), name: "", value: "" }]);
  }
  function removeAttr(id) {
    onChange(attributes.filter((a) => a.id !== id));
  }
  function updateAttr(id, field, val) {
    onChange(attributes.map((a) => a.id === id ? { ...a, [field]: val } : a));
  }

  return (
    <SectionCard
      title="Note Attributes"
      subtitle="Custom key-value metadata attached to the order (not available in native Shopify draft order UI)"
      accent="#9c6ade"
    >
      <div style={{
        padding: "10px 14px",
        background: "rgba(156, 106, 222, 0.08)",
        border: "1px solid rgba(156, 106, 222, 0.25)",
        borderRadius: "8px",
        marginBottom: "16px",
        fontSize: "12px",
        color: "var(--text-secondary)",
        lineHeight: "1.5",
      }}>
        💡 Note attributes (also called <strong>custom attributes</strong>) are stored as key-value pairs on the order.
        They are visible in the Shopify admin, accessible via the API, and useful for custom integrations, fulfilment notes, or tagging orders with metadata.
      </div>

      {attributes.length === 0 && (
        <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "12px" }}>
          No attributes added yet.
        </div>
      )}

      {attributes.map((attr) => (
        <div key={attr.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "10px", marginBottom: "10px", alignItems: "flex-end" }}>
          <div>
            <label style={labelStyle}>Key</label>
            <input
              type="text"
              value={attr.name}
              onChange={(e) => updateAttr(attr.id, "name", e.target.value)}
              placeholder="e.g. fulfillment_priority"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Value</label>
            <input
              type="text"
              value={attr.value}
              onChange={(e) => updateAttr(attr.id, "value", e.target.value)}
              placeholder="e.g. urgent"
              style={inputStyle}
            />
          </div>
          <button
            type="button"
            onClick={() => removeAttr(attr.id)}
            style={{
              ...secondaryBtnStyle,
              padding: "9px 12px",
              color: "#dc3545",
              borderColor: "#dc3545",
            }}
          >✕</button>
        </div>
      ))}

      <button type="button" onClick={addAttr} style={{
        background: "none",
        border: "1px dashed rgba(156, 106, 222, 0.5)",
        borderRadius: "8px",
        padding: "10px 16px",
        width: "100%",
        fontSize: "13px",
        color: "#9c6ade",
        cursor: "pointer",
        transition: "all 0.15s",
      }}>
        ＋ Add attribute
      </button>
    </SectionCard>
  );
}

function NoteSection({ note, onChange }) {
  return (
    <SectionCard title="Order Note" subtitle="Internal note visible in the Shopify admin" accent="#b3bcc9">
      <textarea
        value={note}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Add an internal note for this draft order..."
        rows={3}
        style={{
          ...inputStyle,
          resize: "vertical",
          minHeight: "80px",
          fontFamily: "inherit",
          lineHeight: "1.5",
        }}
      />
    </SectionCard>
  );
}

// ─── SHARED STYLES ────────────────────────────────────────────────────────────

const labelStyle = {
  display: "block",
  fontSize: "12px",
  fontWeight: "600",
  color: "var(--text-secondary)",
  marginBottom: "5px",
  letterSpacing: "0.02em",
};

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid var(--border)",
  borderRadius: "7px",
  fontSize: "13px",
  background: "var(--input-bg)",
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};

const primaryBtnStyle = {
  padding: "9px 18px",
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  borderRadius: "7px",
  fontSize: "13px",
  fontWeight: "600",
  cursor: "pointer",
  transition: "opacity 0.15s",
};

const secondaryBtnStyle = {
  padding: "9px 18px",
  background: "none",
  color: "var(--text-secondary)",
  border: "1px solid var(--border)",
  borderRadius: "7px",
  fontSize: "13px",
  cursor: "pointer",
  transition: "background 0.15s",
};

const qtyBtnStyle = {
  width: "24px",
  height: "24px",
  background: "var(--inset-bg)",
  border: "1px solid var(--border)",
  borderRadius: "5px",
  fontSize: "14px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
  color: "var(--text-primary)",
  padding: 0,
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function DraftOrdersPage() {
  const actionData = useActionData();

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [discount, setDiscount] = useState({ value: "", type: "PERCENTAGE" });
  const [noteAttributes, setNoteAttributes] = useState([]);
  const [note, setNote] = useState("");

  const draftOrder = actionData?.data?.draftOrderCreate?.draftOrder;
  const userErrors = actionData?.data?.draftOrderCreate?.userErrors;

  const cssVars = `
    :root {
      --accent: #5c6ac4;
      --card-bg: #ffffff;
      --card-header-bg: #f9fafb;
      --border: #e1e4e8;
      --text-primary: #202223;
      --text-secondary: #6d7175;
      --input-bg: #ffffff;
      --hover-bg: #f6f7f8;
      --selected-bg: #f0f1ff;
      --inset-bg: #f6f7f8;
      --tag-bg: #e4e5eb;
      --page-bg: #f6f7f8;
    }
  `;

  return (
    <>
      <style>{cssVars}</style>
      <style>{`
        input:focus, select:focus, textarea:focus { border-color: var(--accent) !important; box-shadow: 0 0 0 2px rgba(92,106,196,0.12); }
        * { box-sizing: border-box; }
      `}</style>

      <s-page heading="Create Draft Order">
        <div style={{ maxWidth: "780px", margin: "0 auto", padding: "24px 16px" }}>

          {/* Success Banner */}
          {draftOrder && (
            <div style={{
              background: "#e6f4ea",
              border: "1px solid #34a853",
              borderRadius: "10px",
              padding: "16px 20px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontWeight: "700", color: "#1e7e34", marginBottom: "4px" }}>
                  ✓ Draft order {draftOrder.name} created successfully
                </div>
                <div style={{ fontSize: "13px", color: "#2d6a4f" }}>
                  Total: ${draftOrder.totalPrice}
                </div>
              </div>
              <a
                href={draftOrder.invoiceUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  ...primaryBtnStyle,
                  background: "#34a853",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                Open Invoice ↗
              </a>
            </div>
          )}

          {/* Error Banner */}
          {userErrors?.length > 0 && (
            <div style={{
              background: "#ffeef0",
              border: "1px solid #dc3545",
              borderRadius: "10px",
              padding: "16px 20px",
              marginBottom: "20px",
            }}>
              <div style={{ fontWeight: "700", color: "#c0392b", marginBottom: "6px" }}>
                ⚠ Could not create draft order
              </div>
              {userErrors.map((e, i) => (
                <div key={i} style={{ fontSize: "13px", color: "#c0392b" }}>
                  {e.field ? <strong>[{e.field}]</strong> : null} {e.message}
                </div>
              ))}
            </div>
          )}

          <Form method="post">
            {/* Hidden fields for serialized state */}
            <input type="hidden" name="customerId" value={selectedCustomer?.id ?? ""} />
            <input type="hidden" name="email" value={selectedCustomer?.email ?? ""} />
            <input type="hidden" name="lineItems" value={JSON.stringify(lineItems)} />
            <input type="hidden" name="discountValue" value={discount.value} />
            <input type="hidden" name="discountType" value={discount.type} />
            <input type="hidden" name="noteAttributes" value={JSON.stringify(noteAttributes)} />
            <input type="hidden" name="note" value={note} />

            {/* Sections */}
            <CustomerSection selectedCustomer={selectedCustomer} onSelect={setSelectedCustomer} />
            <ProductsSection lineItems={lineItems} onLineItemsChange={setLineItems} />
            <DiscountSection discount={discount} onChange={setDiscount} />
            <NoteAttributesSection attributes={noteAttributes} onChange={setNoteAttributes} />
            <NoteSection note={note} onChange={setNote} />

            {/* Submit */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "20px",
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
            }}>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                {lineItems.length === 0
                  ? "Add at least one product to create a draft order."
                  : `${lineItems.length} line item(s) · subtotal $${lineItems.reduce((s, li) => s + li.price * li.quantity, 0).toFixed(2)}`}
              </div>
              <button
                type="submit"
                disabled={lineItems.length === 0}
                style={{
                  ...primaryBtnStyle,
                  padding: "11px 28px",
                  fontSize: "14px",
                  opacity: lineItems.length === 0 ? 0.45 : 1,
                  cursor: lineItems.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                Create Draft Order
              </button>
            </div>
          </Form>
        </div>
      </s-page>
    </>
  );
}
