import { useState, useCallback, useEffect } from "react";
import { useActionData, useFetcher, Form } from "react-router";
import { authenticate } from "../shopify.server";

// ─── LOADER ──────────────────────────────────────────────────────────────────
export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const customerQuery = url.searchParams.get("customerQuery") || "";
  const productQuery = url.searchParams.get("productQuery") || "";
  const intent = url.searchParams.get("intent");

  // CUSTOMER SEARCH
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
      {
        variables: {
          query: customerQuery || "a",
        },
      },
    );

    const data = await res.json();

    return {
      customers:
        data.data?.customers?.edges?.map((e) => e.node) ?? [],
      intent: "searchCustomers",
    };
  }

  // PRODUCT SEARCH
  if (intent === "searchProducts") {
    const res = await admin.graphql(
      `query searchProducts($query: String!) {
        products(first: 10, query: $query) {
          edges {
            node {
              id
              title

              featuredImage {
                url
              }

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
      {
        variables: {
          query: productQuery || "*",
        },
      },
    );

    const data = await res.json();

    return {
      products:
        data.data?.products?.edges?.map((e) => e.node) ?? [],
      intent: "searchProducts",
    };
  }

  return {
    customers: [],
    products: [],
    intent: null,
  };
}

// ─── ACTION ──────────────────────────────────────────────────────────────────
export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const customerId = formData.get("customerId");
  const email = formData.get("email");
  const note = formData.get("note");

  const discountValue = formData.get("discountValue");
  const discountType = formData.get("discountType");

  // Line items
  const lineItemsRaw = formData.get("lineItems");
  const lineItems = JSON.parse(lineItemsRaw || "[]");

  // Note attributes
  const noteAttributesRaw = formData.get("noteAttributes");
  const noteAttributesParsed = JSON.parse(
    noteAttributesRaw || "[]",
  );

  const noteAttributes = noteAttributesParsed
    .filter((a) => a.name && a.value)
    .map((a) => ({
      name: a.name,
      value: a.value,
    }));

  // GraphQL line items
  const gqlLineItems = lineItems.map((item) => {
    if (item.type === "variant") {
      return {
        variantId: item.variantId,
        quantity: item.quantity,
      };
    }

    return {
      title: item.title,
      quantity: item.quantity,
      originalUnitPrice: item.price,
      requiresShipping:
        item.requiresShipping ?? true,
      taxable: item.taxable ?? true,
      ...(item.sku ? { sku: item.sku } : {}),
    };
  });

  const input = {
    ...(customerId ? { customerId } : {}),
    ...(email && !customerId ? { email } : {}),

    lineItems: gqlLineItems,

    note: note || "",

    ...(noteAttributes.length > 0
      ? { customAttributes: noteAttributes }
      : {}),

    ...(discountValue &&
    parseFloat(discountValue) > 0
      ? {
          appliedDiscount: {
            title: "App Discount",
            description:
              "Custom discount from app",
            value: parseFloat(discountValue),
            valueType:
              discountType === "FIXED_AMOUNT"
                ? "FIXED_AMOUNT"
                : "PERCENTAGE",
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
    {
      variables: { input },
    },
  );

  return await response.json();
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function uid() {
  return Math.random()
    .toString(36)
    .slice(2, 9);
}

// ─── SHARED STYLES ───────────────────────────────────────────────────────────

const labelStyle = {
  display: "block",
  fontSize: "12px",
  fontWeight: "600",
  color: "var(--text-secondary)",
  marginBottom: "5px",
};

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "13px",
  background: "var(--input-bg)",
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
};

const primaryBtnStyle = {
  padding: "10px 18px",
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  fontSize: "13px",
  fontWeight: "600",
  cursor: "pointer",
};

const secondaryBtnStyle = {
  padding: "10px 18px",
  background: "transparent",
  color: "var(--text-secondary)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "13px",
  cursor: "pointer",
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
};

// ─── UI COMPONENTS ───────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  children,
  accent,
}) {
  return (
    <div
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--border)",
        borderRadius: "12px",

        overflow: "visible",

        position: "relative",

        zIndex: 1,

        marginBottom: "20px",
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          borderBottom:
            "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: "var(--card-header-bg)",
        }}
      >
        {accent && (
          <span
            style={{
              width: "4px",
              height: "20px",
              borderRadius: "2px",
              background: accent,
            }}
          />
        )}

        <div>
          <div
            style={{
              fontSize: "14px",
              fontWeight: "600",
              color: "var(--text-primary)",
            }}
          >
            {title}
          </div>

          {subtitle && (
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                marginTop: "2px",
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "20px" }}>
        {children}
      </div>
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
  loading,
}) {
  return (
    <div style={{ position: "relative" }}>
      <span
        style={{
          position: "absolute",
          left: "12px",
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--text-secondary)",
          pointerEvents: "none",
        }}
      >
        🔍
      </span>

      <input
        type="text"
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
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
        }}
      />

      {loading && (
        <span
          style={{
            position: "absolute",
            right: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: "12px",
          }}
        >
          ⏳
        </span>
      )}
    </div>
  );
}

// ─── CUSTOMER SECTION ────────────────────────────────────────────────────────

function CustomerSection({
  selectedCustomer,
  onSelect,
}) {
  const fetcher = useFetcher();

  const [query, setQuery] = useState("");
  const [showResults, setShowResults] =
    useState(false);

  const customers =
    fetcher.data?.intent ===
    "searchCustomers"
      ? fetcher.data.customers
      : [];

  const loading =
    fetcher.state === "loading";

  const searchCustomers = useCallback(
    (value) => {
      if (!value || value.trim().length < 1) {
        setShowResults(false);
        return;
      }

      setShowResults(true);

      fetcher.load(
        `?intent=searchCustomers&customerQuery=${encodeURIComponent(
          value,
        )}`,
      );
    },
    [fetcher],
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      searchCustomers(query);
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, searchCustomers]);

  return (
    <SectionCard
      title="Customer"
      subtitle="Search and select customer"
      accent="#5c6ac4"
    >
      {selectedCustomer ? (
        <div
          style={{
            padding: "14px",
            borderRadius: "8px",
            background:
              "var(--selected-bg)",
            border:
              "1px solid var(--accent)",
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontWeight: "600",
                fontSize: "14px",
              }}
            >
              {
                selectedCustomer.displayName
              }
            </div>

            <div
              style={{
                fontSize: "12px",
                color:
                  "var(--text-secondary)",
              }}
            >
              {selectedCustomer.email}
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              onSelect(null)
            }
            style={secondaryBtnStyle}
          >
            Remove
          </button>
        </div>
      ) : (
        <div
          style={{
            position: "relative",
            overflow: "visible",
          }}
        >
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search customer..."
            loading={loading}
          />

          {showResults &&
            customers.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,

                  zIndex: 9999,

                  background:
                    "var(--card-bg)",
                  border:
                    "1px solid var(--border)",
                  borderRadius: "8px",
                  boxShadow:
                    "0 12px 30px rgba(0,0,0,0.15)",
                  marginTop: "4px",
                  maxHeight: "300px",
                  overflowY: "auto",
                }}
              >
                {customers.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      onSelect(c);
                      setQuery("");
                      setShowResults(false);
                    }}
                    style={{
                      padding:
                        "12px 14px",
                      cursor: "pointer",
                      borderBottom:
                        "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: "600",
                      }}
                    >
                      {c.displayName}
                    </div>

                    <div
                      style={{
                        fontSize: "12px",
                        color:
                          "var(--text-secondary)",
                      }}
                    >
                      {c.email}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
    </SectionCard>
  );
}

// ─── PRODUCTS SECTION ────────────────────────────────────────────────────────

function ProductsSection({
  lineItems,
  onLineItemsChange,
}) {
  const fetcher = useFetcher();

  const [query, setQuery] = useState("");
  const [showResults, setShowResults] =
    useState(false);

  const products =
    fetcher.data?.intent ===
    "searchProducts"
      ? fetcher.data.products
      : [];

  const loading =
    fetcher.state === "loading";

  const searchProducts = useCallback(
    (value) => {
      setShowResults(true);

      fetcher.load(
        `?intent=searchProducts&productQuery=${encodeURIComponent(
          value || "*",
        )}`,
      );
    },
    [fetcher],
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      searchProducts(query);
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, searchProducts]);

  function addVariant(product, variant) {
    const existing = lineItems.find(
      (li) =>
        li.type === "variant" &&
        li.variantId === variant.id,
    );

    if (existing) {
      onLineItemsChange(
        lineItems.map((li) =>
          li.variantId === variant.id
            ? {
                ...li,
                quantity:
                  li.quantity + 1,
              }
            : li,
        ),
      );
    } else {
      onLineItemsChange([
        ...lineItems,
        {
          id: uid(),
          type: "variant",
          variantId: variant.id,
          productTitle: product.title,
          variantTitle:
            variant.title !==
            "Default Title"
              ? variant.title
              : "",
          price: parseFloat(
            variant.price,
          ),
          quantity: 1,
          image:
            product.featuredImage
              ?.url || "",
        },
      ]);
    }

    setShowResults(false);
    setQuery("");
  }

  return (
    <SectionCard
      title="Products"
      subtitle={`${lineItems.length} line item(s)`}
      accent="#47c1bf"
    >
      <div
        style={{
          position: "relative",
          overflow: "visible",
        }}
      >
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search products..."
          loading={loading}
        />

        {showResults &&
          products.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,

                zIndex: 9999,

                background:
                  "var(--card-bg)",
                border:
                  "1px solid var(--border)",
                borderRadius: "8px",
                boxShadow:
                  "0 12px 30px rgba(0,0,0,0.15)",
                marginTop: "4px",
                maxHeight: "360px",
                overflowY: "auto",
              }}
            >
              {products.map((p) => (
                <div key={p.id}>
                  <div
                    style={{
                      padding:
                        "8px 14px",
                      fontSize: "12px",
                      fontWeight: "700",
                      color:
                        "var(--text-secondary)",
                      textTransform:
                        "uppercase",
                    }}
                  >
                    {p.title}
                  </div>

                  {p.variants.edges.map(
                    ({ node: v }) => (
                      <div
                        key={v.id}
                        onClick={() =>
                          addVariant(
                            p,
                            v,
                          )
                        }
                        style={{
                          padding:
                            "10px 14px",
                          display: "flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "space-between",
                          cursor:
                            "pointer",
                          borderBottom:
                            "1px solid var(--border)",
                        }}
                      >
                        <div
                          style={{
                            display:
                              "flex",
                            alignItems:
                              "center",
                            gap: "10px",
                          }}
                        >
                          <img
                            src={
                              p
                                .featuredImage
                                ?.url
                            }
                            alt={p.title}
                            style={{
                              width:
                                "42px",
                              height:
                                "42px",
                              objectFit:
                                "cover",
                              borderRadius:
                                "6px",
                              border:
                                "1px solid var(--border)",
                              background:
                                "#f6f6f7",
                              flexShrink: 0,
                            }}
                          />

                          <div>
                            <div
                              style={{
                                fontSize:
                                  "13px",
                                fontWeight:
                                  "600",
                              }}
                            >
                              {v.title !==
                              "Default Title"
                                ? v.title
                                : "Default"}
                            </div>

                            <div
                              style={{
                                fontSize:
                                  "11px",
                                color:
                                  "var(--text-secondary)",
                              }}
                            >
                              {v.sku
                                ? `SKU: ${v.sku}`
                                : ""}
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize:
                              "13px",
                            fontWeight:
                              "700",
                          }}
                        >
                          ${v.price}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              ))}
            </div>
          )}
      </div>

      {/* LINE ITEMS */}
      {lineItems.length > 0 && (
        <div
          style={{
            marginTop: "18px",
          }}
        >
          {lineItems.map((li) => (
            <div
              key={li.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent:
                  "space-between",
                padding: "12px 0",
                borderBottom:
                  "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                {li.image && (
                  <img
                    src={li.image}
                    alt=""
                    style={{
                      width: "48px",
                      height: "48px",
                      objectFit:
                        "cover",
                      borderRadius:
                        "8px",
                    }}
                  />
                )}

                <div>
                  <div
                    style={{
                      fontSize:
                        "13px",
                      fontWeight:
                        "600",
                    }}
                  >
                    {li.productTitle}
                  </div>

                  <div
                    style={{
                      fontSize:
                        "12px",
                      color:
                        "var(--text-secondary)",
                    }}
                  >
                    ${li.price}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    onLineItemsChange(
                      lineItems.map(
                        (x) =>
                          x.id === li.id
                            ? {
                                ...x,
                                quantity:
                                  Math.max(
                                    1,
                                    x.quantity -
                                      1,
                                  ),
                              }
                            : x,
                      ),
                    )
                  }
                  style={qtyBtnStyle}
                >
                  −
                </button>

                <span>
                  {li.quantity}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    onLineItemsChange(
                      lineItems.map(
                        (x) =>
                          x.id === li.id
                            ? {
                                ...x,
                                quantity:
                                  x.quantity +
                                  1,
                              }
                            : x,
                      ),
                    )
                  }
                  style={qtyBtnStyle}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function DraftOrdersPage() {
  const actionData = useActionData();

  const [selectedCustomer, setSelectedCustomer] =
    useState(null);

  const [lineItems, setLineItems] =
    useState([]);

  const draftOrder =
    actionData?.data?.draftOrderCreate
      ?.draftOrder;

  const userErrors =
    actionData?.data?.draftOrderCreate
      ?.userErrors;

  return (
    <>
      <style>{`
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
          --page-bg: #f6f7f8;
        }

        * {
          box-sizing: border-box;
        }
      `}</style>

      <s-page heading="Create Draft Order">
        <div
          style={{
            maxWidth: "820px",
            margin: "0 auto",
            padding: "24px 16px",
            overflow: "visible",
          }}
        >
          {draftOrder && (
            <div
              style={{
                padding: "16px",
                background:
                  "#e6f4ea",
                border:
                  "1px solid #34a853",
                borderRadius: "10px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  fontWeight: "700",
                  color: "#1e7e34",
                }}
              >
                Draft order{" "}
                {draftOrder.name} created
              </div>
            </div>
          )}

          {userErrors?.length > 0 && (
            <div
              style={{
                padding: "16px",
                background:
                  "#ffeef0",
                border:
                  "1px solid #dc3545",
                borderRadius: "10px",
                marginBottom: "20px",
              }}
            >
              {userErrors.map(
                (e, i) => (
                  <div key={i}>
                    {e.message}
                  </div>
                ),
              )}
            </div>
          )}

          <Form method="post">
            <input
              type="hidden"
              name="customerId"
              value={
                selectedCustomer?.id ||
                ""
              }
            />

            <input
              type="hidden"
              name="email"
              value={
                selectedCustomer?.email ||
                ""
              }
            />

            <input
              type="hidden"
              name="lineItems"
              value={JSON.stringify(
                lineItems,
              )}
            />

            <CustomerSection
              selectedCustomer={
                selectedCustomer
              }
              onSelect={
                setSelectedCustomer
              }
            />

            <ProductsSection
              lineItems={lineItems}
              onLineItemsChange={
                setLineItems
              }
            />

            <button
              type="submit"
              disabled={
                lineItems.length === 0
              }
              style={{
                ...primaryBtnStyle,
                width: "100%",
                padding: "14px",
                marginTop: "10px",
                opacity:
                  lineItems.length === 0
                    ? 0.5
                    : 1,
              }}
            >
              Create Draft Order
            </button>
          </Form>
        </div>
      </s-page>
    </>
  );
}