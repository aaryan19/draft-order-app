import { useActionData, Form } from "react-router";

import { authenticate } from "../shopify.server";

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();

  const response = await admin.graphql(`
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          name
          invoiceUrl
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    variables: {
      input: {
        email: formData.get("email"),

        lineItems: [
          {
            variantId: formData.get("variantId"),
            quantity: Number(formData.get("quantity")),
          },
        ],

        appliedDiscount: {
          title: "App Discount",
          description: "Custom app discount",
          value: 10,
          valueType: "PERCENTAGE",
        },

        note: "Created from custom app",
      },
    },
  });

  const result = await response.json();

  return result;
}

export default function DraftOrdersPage() {
  const actionData = useActionData();

  return (
    <s-page heading="Create Draft Order">
      <div style={{ padding: "20px" }}>
        <Form method="post">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              maxWidth: "500px",
            }}
          >
            <input
              type="email"
              name="email"
              placeholder="Customer email"
              required
            />

            <input
              type="text"
              name="variantId"
              placeholder="Variant GID"
              required
            />

            <input
              type="number"
              name="quantity"
              placeholder="Quantity"
              defaultValue="1"
              required
            />

            <button type="submit">
              Create Draft Order
            </button>
          </div>
        </Form>

        {actionData?.data?.draftOrderCreate?.draftOrder && (
          <div style={{ marginTop: "20px" }}>
            <p>
              Draft Order Created:
            </p>

            <p>
              {
                actionData.data.draftOrderCreate
                  .draftOrder.name
              }
            </p>

            <a
              href={
                actionData.data.draftOrderCreate
                  .draftOrder.invoiceUrl
              }
              target="_blank"
            >
              Open Invoice
            </a>
          </div>
        )}

        {actionData?.data?.draftOrderCreate?.userErrors
          ?.length > 0 && (
          <div style={{ marginTop: "20px", color: "red" }}>
            {actionData.data.draftOrderCreate.userErrors.map(
              (err, index) => (
                <p key={index}>
                  {err.message}
                </p>
              )
            )}
          </div>
        )}
      </div>
    </s-page>
  );
}