export function serializeMovement(m) {
  return {
    id: m._id.toString(),
    productId: m.productId.toString(),
    productName: m.productName,
    sku: m.sku,
    type: m.type,
    quantityChange: m.quantityChange,
    previousStock: m.previousStock,
    newStock: m.newStock,
    reason: m.reason || '',
    userName: m.userName,
    createdAt: m.createdAt,
  };
}
