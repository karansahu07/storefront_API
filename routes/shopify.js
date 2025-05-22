// Shopify Storefront Express Router – customer‑facing API layer
// --------------------------------------------------------------
// Notes:
// • Cursor‑based pagination is exposed via `?after=` & `?before=` query params.
// • All responses are normalised JSON objects – no GraphQL wrapper noise.
// • Environment variables required:
//     SHOPIFY_DOMAIN, SHOPIFY_STOREFRONT_TOKEN
// --------------------------------------------------------------

const express = require("express");
const { request, gql } = require("graphql-request");
const axios = require("axios");

const router = express.Router();

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;

// ---------------------------------------------
// Helpers
// ---------------------------------------------
const SHOPIFY_ENDPOINT = `https://${process.env.SHOPIFY_DOMAIN}/api/2023-10/graphql.json`;
const HEADERS = {
  "X-Shopify-Storefront-Access-Token": process.env.SHOPIFY_STOREFRONT_TOKEN,
  "Content-Type": "application/json",
};

const ADMIN_API = `https://${SHOPIFY_DOMAIN}/admin/api/2023-10/graphql.json`;
const ADMIN_HEADERS = {
  "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN,
  "Content-Type": "application/json",
};

/**
 * Execute a GraphQL query or mutation against the Storefront API.
 * Auto‑throws on userErrors.
 */
async function storefront(query, variables = {}) {
  const data = await request(SHOPIFY_ENDPOINT, query, variables, HEADERS);
  // Surface top‑level userErrors (mutations only) – keeps handlers clean
  const errorPaths = Object.keys(data).filter(
    (k) => data[k]?.customerUserErrors || data[k]?.userErrors
  );
  if (errorPaths.length) {
    const errs = errorPaths
      .map((k) => data[k].customerUserErrors || data[k].userErrors)
      .flat();
    const e = new Error("Shopify user error");
    e.details = errs;
    throw e;
  }
  return data;
}

// ---------------------------------------------
// 1. Products list (cursor pagination)
//    GET /products?first=12&after=CURSOR
//    GET /products?last=12&before=CURSOR
// ---------------------------------------------
router.get("/products", async (req, res) => {
  const { first = 10, last, after, before } = req.query;
  const edgesField =
    "edges { cursor node { id title handle description images(first:1){edges{node{url}}} variants(first:1){edges{node{price{amount}}}} } }";
  const query = gql`
    query Products($first: Int, $last: Int, $after: String, $before: String) {
      products(first: $first, last: $last, after: $after, before: $before) {
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        ${edgesField}
      }
    }
  `;
  try {
    const vars = {
      first: Number(first),
      last: last ? Number(last) : undefined,
      after,
      before,
    };
    const data = await storefront(query, vars);
    const { pageInfo, edges } = data.products;
    res.json({
      pageInfo,
      products: edges.map((e) => ({ ...e.node, cursor: e.cursor })),
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch products",
      details: err.details || err.message,
    });
  }
});

// ---------------------------------------------
// 2. Single product by handle
//    GET /products/:handle
// ---------------------------------------------
router.get("/products/:handle", async (req, res) => {
  const handle = req.params.handle;
  const query = gql`
    query ProductByHandle($handle: String!) {
      product(handle: $handle) {
        id
        title
        handle
        description
        images(first: 10) {
          edges {
            node {
              url
            }
          }
        }
        variants(first: 25) {
          edges {
            node {
              id
              title
              price {
                amount
              }
            }
          }
        }
      }
    }
  `;
  try {
    const data = await storefront(query, { handle: handle });
    console.log(data);
    if (!data.productByHandle)
      return res.status(404).json({ error: "Product not found" });
    res.json(data.productByHandle);
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch product",
      details: err.details || err.message,
    });
  }
});

// ---------------------------------------------
// 3. Collections w/ cursor pagination
//    GET /collections?first=10&after=CURSOR
// ---------------------------------------------
// -------------------- GET COLLECTIONS WITH 4 PRODUCTS EACH --------------------
// router.get("/all-collections", async (req, res) => {
//   const { cursor } = req.query;
//   const pagination = cursor ? `after: "${cursor}"` : "";

//   const query = gql`
//     {
//       collections(first: 10, ${pagination}) {
//         pageInfo {
//           hasNextPage
//           endCursor
//         }
//         edges {
//           cursor
//           node {
//             id
//             title
//             handle
//             description
//             products(first: 4) {
//               edges {
//                 node {
//                   id
//                   title
//                   handle
//                   description
//                   images(first: 1) {
//                     edges {
//                       node {
//                         url
//                       }
//                     }
//                   }
//                   variants(first: 1) {
//                     edges {
//                       node {
//                         price {
//                           amount
//                         }
//                       }
//                     }
//                   }
//                 }
//               }
//             }
//           }
//         }
//       }
//     }
//   `;

//   try {
//     const data = await request(SHOPIFY_ENDPOINT, query, {}, HEADERS);
//     const formattedCollections = data.collections.edges.map((edge) => ({
//       cursor: edge.cursor,
//       ...edge.node,
//       products: edge.node.products.edges.map((p) => p.node),
//     }));

//     res.json({
//       collections: formattedCollections,
//       pageInfo: data.collections.pageInfo,
//       lastCursor: data.collections.pageInfo.endCursor,
//     });
//   } catch (err) {
//     res
//       .status(500)
//       .json({ error: "Failed to fetch collections", details: err.message });
//   }
// });

// router.get("/all-collections", async (req, res) => {
//   let allCollections = [];
//   let hasNextPage = true;
//   let cursor = null;

//   try {
//     while (hasNextPage) {
//       const pagination = cursor ? `after: "${cursor}"` : "";

//       const query = gql`
//         {
//           collections(first: 50, ${pagination}) {
//             pageInfo {
//               hasNextPage
//               endCursor
//             }
//             edges {
//               node {
//                 id
//                 title
//                 handle
//                 updatedAt
//                 products(first: 100) {
//                   edges {
//                     node {
//                       id
//                       title
//                       handle
//                       createdAt
//                       description
//                       images(first: 1) {
//                         edges {
//                           node {
//                             url
//                           }
//                         }
//                       }
//                       variants(first: 1) {
//                         edges {
//                           node {
//                             price {
//                               amount
//                             }
//                             compareAtPrice {
//                               amount
//                             }
//                           }
//                         }
//                       }
//                       metafield(namespace: "custom", key: "money_price") {
//                         value
//                       }
//                     }
//                   }
//                 }
//               }
//             }
//           }
//         }
//       `;

//       const data = await request(SHOPIFY_ENDPOINT, query, {}, HEADERS);

//       const collections = data.collections.edges.map((edge) => {
//         const collection = edge.node;

//         const products = collection.products.edges
//           .map((p) => {
//             const prod = p.node;
//             return {
//               id: prod.id,
//               title: prod.title,
//               handle: prod.handle,
//               createdAt: prod.createdAt,
//               description: prod.description,
//               image: prod.images?.edges?.[0]?.node?.url || null,
//               salePrice: prod.variants?.edges?.[0]?.node?.price?.amount || null,
//               comparePrice: prod.variants?.edges?.[0]?.node?.compareAtPrice?.amount || null,
//               rewardsNote: prod.metafield?.value || null,
//               moneyPrice: prod.metafield?.value || null,
//             };
//           })
//           .slice(0, 4); // limit to 4 products

//         if (products.length > 0) {
//           return {
//             id: collection.id,
//             title: collection.title,
//             handle: collection.handle,
//             updatedAt: collection.updatedAt,
//             products,
//           };
//         }

//         return null;
//       }).filter(Boolean);

//       allCollections = allCollections.concat(collections);
//       hasNextPage = data.collections.pageInfo.hasNextPage;
//       cursor = data.collections.pageInfo.endCursor;
//     }

//     res.json(allCollections);
//   } catch (err) {
//     console.error("Storefront API error:", err);
//     res.status(500).json({ error: "Failed to fetch collections", details: err.message });
//   }
// });

// router.get("/all-collections", async (req, res) => {
//   let allCollections = [];
//   let hasNextPage = true;
//   let cursor = null;

//   try {
//     while (hasNextPage) {
//       const query = gql`
//         query {
//           collections(first: 50, ${cursor ? `after: "${cursor}"` : ""}) {
//             pageInfo {
//               hasNextPage
//               endCursor
//             }
//             edges {
//               node {
//                 id
//                 title
//                 handle
//                 updatedAt
//                 products(first: 100) {
//                   edges {
//                     node {
//                       id
//                       title
//                       handle
//                       createdAt
//                       description
//                       images(first: 1) {
//                         edges {
//                           node {
//                             url
//                           }
//                         }
//                       }
//                       variants(first: 1) {
//                         edges {
//                           node {
//                             price {
//                               amount
//                             }
//                             compareAtPrice {
//                               amount
//                             }
//                           }
//                         }
//                       }
//                       metafield(namespace: "custom", key: "money_price") {
//                         value
//                       }
//                     }
//                   }
//                 }
//               }
//             }
//           }
//         }
//       `;

//       const data = await request(SHOPIFY_ENDPOINT, query, {}, HEADERS);

//       const collections = data.collections.edges
//         .map(({ node: collection }) => {
//           const products = collection.products.edges
//             .map(({ node: prod }) => ({
//               id: prod.id,
//               title: prod.title,
//               handle: prod.handle,
//               createdAt: prod.createdAt,
//               description: prod.description,
//               image: prod.images?.edges?.[0]?.node?.url || null,
//               salePrice: prod.variants?.edges?.[0]?.node?.price?.amount || null,
//               comparePrice: prod.variants?.edges?.[0]?.node?.compareAtPrice?.amount || null,
//               rewardsNote: prod.metafield?.value || null,
//               moneyPrice: prod.metafield?.value || null,
//             }))
//             .slice(0, 4); // Limit to 4 products

//           if (products.length > 0) {
//             return {
//               id: collection.id,
//               title: collection.title,
//               handle: collection.handle,
//               updatedAt: collection.updatedAt,
//               products,
//             };
//           }

//           return null;
//         })
//         .filter(Boolean);

//       allCollections.push(...collections);
//       hasNextPage = data.collections.pageInfo.hasNextPage;
//       cursor = data.collections.pageInfo.endCursor;
//     }

//     res.json(allCollections);
//   } catch (err) {
//     console.error("Storefront API error:", err);
//     res.status(500).json({
//       error: "Failed to fetch collections",
//       details: err?.response?.errors || err.message,
//     });
//   }
// });

// router.get("/all-collections", async (req, res) => {
//   try {
//     const query = gql`
//       {
//         collections(first: 10) {
//           edges {
//             node {
//               id
//               title
//               handle
//               updatedAt
//               products(first: 10) {
//                 edges {
//                   node {
//                     id
//                     title
//                     handle
//                     createdAt
//                     description
//                     images(first: 1) {
//                       edges {
//                         node {
//                           url
//                         }
//                       }
//                     }
//                     variants(first: 1) {
//                       edges {
//                         node {
//                           price {
//                             amount
//                           }
//                           compareAtPrice {
//                             amount
//                           }
//                         }
//                       }
//                     }
//                     metafield(namespace: "custom", key: "money_price") {
//                       value
//                     }
//                   }
//                 }
//               }
//             }
//           }
//         }
//       }
//     `;

//     // ✅ Storefront API Call
//     const storefrontRes = await request(SHOPIFY_ENDPOINT, query, {}, HEADERS);

//     // ✅ Gather All Product GIDs
//     const allProducts = [];
//     for (const collectionEdge of storefrontRes.collections.edges) {
//       const products = collectionEdge.node.products.edges.map((p) => p.node);
//       allProducts.push(...products);
//     }

//     const productGIDs = allProducts.map((p) => p.id);

//     // ✅ Admin API Query to Get Product Statuses
//     const adminQuery = {
//       query: `
//         {
//           nodes(ids: [${productGIDs.map((id) => `"${id}"`).join(",")}]) {
//             ... on Product {
//               id
//               status
//             }
//           }
//         }
//       `,
//     };

//     const adminRes = await axios.post(ADMIN_API, adminQuery, {
//       headers: ADMIN_HEADERS,
//     });

//     const statusMap = {};
//     for (const product of adminRes.data.data.nodes) {
//       if (product) statusMap[product.id] = product.status;
//     }

//     // ✅ Prepare Response with Filtered ACTIVE Products
//     const allCollections = storefrontRes.collections.edges.map((edge) => {
//       const collection = edge.node;

//       const filteredProducts = collection.products.edges
//         .map((p) => p.node)
//         .filter((p) => statusMap[p.id] === "ACTIVE")
//         .map((p) => ({
//           id: p.id,
//           title: p.title,
//           handle: p.handle,
//           createdAt: p.createdAt,
//           description: p.description,
//           image: p.images?.edges?.[0]?.node?.url || null,
//           salePrice: p.variants?.edges?.[0]?.node?.price?.amount || null,
//           comparePrice: p.variants?.edges?.[0]?.node?.compareAtPrice?.amount || null,
//           moneyPrice: p.metafield?.value || null,
//         }));

//       return {
//         id: collection.id,
//         title: collection.title,
//         handle: collection.handle,
//         updatedAt: collection.updatedAt,
//         products: filteredProducts,
//       };
//     });

//     res.json(allCollections);
//   } catch (err) {
//     console.error("Error fetching collections:", err?.response?.data || err.message || err);
//     res.status(500).json({ error: "Failed to fetch collections", details: err?.message || "Unknown error" });
//   }
// });

// module.exports = router;



// ✅ Target collections
const TARGET_COLLECTIONS = ["television", "headphones", "soundbar", "speakers", "cameras"];

router.get("/all-collections", async (req, res) => {
  try {
    const query = gql`
      {
        collections(first: 20) {
          edges {
            node {
              id
              title
              handle
              updatedAt
              products(first: 10) {
                edges {
                  node {
                    id
                    title
                    handle
                    createdAt
                    description
                    images(first: 1) {
                      edges {
                        node {
                          url
                        }
                      }
                    }
                    variants(first: 1) {
                      edges {
                        node {
                          price {
                            amount
                          }
                          compareAtPrice {
                            amount
                          }
                        }
                      }
                    }
                    metafield(namespace: "custom", key: "money_price") {
                      value
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    // ✅ Storefront API Call
    const storefrontRes = await request(SHOPIFY_ENDPOINT, query, {}, HEADERS);

    // ✅ Filter collections by title or handle
    const matchingCollections = storefrontRes.collections.edges.filter(({ node }) => {
      const lowerTitle = node.title.toLowerCase();
      const lowerHandle = node.handle.toLowerCase();
      return TARGET_COLLECTIONS.some(
        (target) => lowerTitle.includes(target) || lowerHandle.includes(target)
      );
    });

    // ✅ Gather product GIDs from filtered collections
    const allProducts = [];
    for (const collectionEdge of matchingCollections) {
      const products = collectionEdge.node.products.edges.map((p) => p.node);
      allProducts.push(...products);
    }

    const productGIDs = allProducts.map((p) => p.id);

    // ✅ Admin API Call to get product statuses
    const adminQuery = {
      query: `
        {
          nodes(ids: [${productGIDs.map((id) => `"${id}"`).join(",")}]) {
            ... on Product {
              id
              status
            }
          }
        }
      `,
    };

    const adminRes = await axios.post(ADMIN_API, adminQuery, { headers: ADMIN_HEADERS });

    const statusMap = {};
    for (const product of adminRes.data.data.nodes) {
      if (product) statusMap[product.id] = product.status;
    }

    // ✅ Construct final response with only ACTIVE products
    const finalCollections = matchingCollections.map(({ node: collection }) => {
      const filteredProducts = collection.products.edges
        .map((p) => p.node)
        .filter((p) => statusMap[p.id] === "ACTIVE")
        .map((p) => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          createdAt: p.createdAt,
          description: p.description,
          image: p.images?.edges?.[0]?.node?.url || null,
          salePrice: p.variants?.edges?.[0]?.node?.price?.amount || null,
          comparePrice: p.variants?.edges?.[0]?.node?.compareAtPrice?.amount || null,
          moneyPrice: p.metafield?.value || null,
        }));

      return {
        id: collection.id,
        title: collection.title,
        handle: collection.handle,
        updatedAt: collection.updatedAt,
        products: filteredProducts,
      };
    });

    res.json(finalCollections);
  } catch (err) {
    console.error("Error fetching collections:", err?.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to fetch collections", details: err?.message || "Unknown error" });
  }
});

module.exports = router;

// ---------------------------------------------
// 4. Customer authentication
// ---------------------------------------------
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const mutation = gql`
    mutation Login($input: CustomerAccessTokenCreateInput!) {
      customerAccessTokenCreate(input: $input) {
        customerAccessToken {
          accessToken
          expiresAt
        }
        customerUserErrors {
          field
          message
        }
      }
    }
  `;
  try {
    const data = await storefront(mutation, { input: { email, password } });
    res.json(data.customerAccessTokenCreate.customerAccessToken);
  } catch (err) {
    res
      .status(400)
      .json({ error: "Login failed", details: err.details || err.message });
  }
});

router.post("/logout", async (req, res) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(400).json({ error: "Missing token" });
  const mutation = gql`
    mutation Logout($token: String!) {
      customerAccessTokenDelete(customerAccessToken: $token) {
        deletedAccessToken
        userErrors {
          field
          message
        }
      }
    }
  `;
  try {
    await storefront(mutation, { token });
    res.json({ ok: true });
  } catch (err) {
    res
      .status(400)
      .json({ error: "Logout failed", details: err.details || err.message });
  }
});

// ---------------------------------------------
// 5. Customer orders (requires Bearer token)
//    GET /orders
// ---------------------------------------------
router.get("/orders", async (req, res) => {
  const token = req.headers["authorization"];
  if (!token)
    return res.status(401).json({ error: "Missing customer access token" });
  const query = gql`
    query Orders($token: String!) {
      customer(customerAccessToken: $token) {
        orders(first: 20, sortKey: PROCESSED_AT, reverse: true) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              name
              orderNumber
              processedAt
              totalPrice {
                amount
              }
              lineItems(first: 50) {
                edges {
                  node {
                    title
                    quantity
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  try {
    const data = await storefront(query, { token });
    const ordersEdge = data.customer?.orders;
    if (!ordersEdge)
      return res.status(404).json({ error: "Customer not found" });
    res.json({
      pageInfo: ordersEdge.pageInfo,
      orders: ordersEdge.edges.map((e) => ({ ...e.node, cursor: e.cursor })),
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch orders",
      details: err.details || err.message,
    });
  }
});

// ---------------------------------------------
// 6. Cart – create / addLines / removeLines / updateLines
//    POST /cart (create)
//    POST /cart/:id/add
//    POST /cart/:id/update
//    POST /cart/:id/remove
// ---------------------------------------------
router.post("/cart", async (req, res) => {
  const mutation = gql`
    mutation CartCreate($lines: [CartLineInput!]){
      cartCreate(input:{lines:$lines}){cart{id checkoutUrl lines(first:50){edges{node{id quantity merchandise{id ... on ProductVariant { title price { amount } }}}}} userErrors{field message}}
    }
  `;
  try {
    const data = await storefront(mutation, { lines: req.body.lines || [] });
    res.json(data.cartCreate.cart);
  } catch (err) {
    res.status(400).json({
      error: "Cart creation failed",
      details: err.details || err.message,
    });
  }
});

const cartMutation = (field) => gql`
  mutation Cart${field}($cartId: ID!, $lines: [CartLineInput!]!, $lineIds: [ID!]){
    cart${field}(cartId:$cartId, lines:$lines, lineIds:$lineIds){cart{id checkoutUrl lines(first:50){edges{node{id quantity merchandise{id ... on ProductVariant { title price{amount} }}}}} userErrors{field message}}}
`;

router.post("/cart/:id/add", async (req, res) => {
  try {
    const data = await storefront(cartMutation("LinesAdd"), {
      cartId: req.params.id,
      lines: req.body.lines,
    });
    res.json(data.cartLinesAdd.cart);
  } catch (err) {
    res.status(400).json({
      error: "Add to cart failed",
      details: err.details || err.message,
    });
  }
});

router.post("/cart/:id/update", async (req, res) => {
  try {
    const data = await storefront(cartMutation("LinesUpdate"), {
      cartId: req.params.id,
      lines: req.body.lines,
    });
    res.json(data.cartLinesUpdate.cart);
  } catch (err) {
    res.status(400).json({
      error: "Update cart failed",
      details: err.details || err.message,
    });
  }
});

router.post("/cart/:id/remove", async (req, res) => {
  try {
    const data = await storefront(cartMutation("LinesRemove"), {
      cartId: req.params.id,
      lineIds: req.body.lineIds,
    });
    res.json(data.cartLinesRemove.cart);
  } catch (err) {
    res.status(400).json({
      error: "Remove from cart failed",
      details: err.details || err.message,
    });
  }
});

module.exports = router;
