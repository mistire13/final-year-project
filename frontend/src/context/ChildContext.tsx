import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { ChildSummary, CartItem, Product } from "../types";
import { clampQuantity } from "../utils/cart";
import { getMyChildren } from "../api/parentApi";

interface ChildContextType {
  selectedChild: ChildSummary | null;
  setSelectedChild: (child: ChildSummary) => void;
  childrenList: ChildSummary[];
  // Shopping Cart state
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;
  cartItemCount: number;
}

const ChildContext = createContext<ChildContextType | undefined>(undefined);

export const ChildProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const [selectedChild, setSelectedChild] = useState<ChildSummary | null>(null);
  const [childrenList, setChildrenList] = useState<ChildSummary[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  useEffect(()=>{setCart([]);},[user?.id,user?.daycare_id]);

  useEffect(() => {
    let cancelled = false;
    setChildrenList([]);
    setSelectedChild(null);
    if (user?.linked_children && user.linked_children.length > 0) {
      setChildrenList(user.linked_children);
      setSelectedChild(user.linked_children[0]);
    } else if (user?.role === "parent") {
      getMyChildren()
        .then((kids) => {
          if (cancelled) return;
          if (kids && kids.length > 0) {
            setChildrenList(kids);
            setSelectedChild(kids[0]);
          } else {
            setChildrenList([]);
            setSelectedChild(null);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setChildrenList([]);
          setSelectedChild(null);
        });
    }
    return () => { cancelled = true; };
  }, [user]);

  const addToCart = (product: Product, quantity: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? {
                ...item,
                quantity: clampQuantity(
                  item.quantity + quantity,
                  item.product.stock_quantity,
                  item.product.in_stock !== false,
                ),
              }
            : item,
        );
      }
      const allowed = clampQuantity(
        quantity,
        product.stock_quantity,
        product.in_stock !== false,
      );
      return allowed ? [...prev, { product, quantity: allowed }] : prev;
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const updateQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? {
              ...item,
              quantity: clampQuantity(
                quantity,
                item.product.stock_quantity,
                item.product.in_stock !== false,
              ),
            }
          : item,
      ),
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  const cartTotal = cart.reduce((sum, item) => {
    const price =
      typeof item.product.price === "string"
        ? parseFloat(item.product.price)
        : item.product.price;
    return sum + price * item.quantity;
  }, 0);

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <ChildContext.Provider
      value={{
        selectedChild,
        setSelectedChild,
        childrenList,
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartTotal,
        cartItemCount,
      }}
    >
      {children}
    </ChildContext.Provider>
  );
};

export const useChild = (): ChildContextType => {
  const context = useContext(ChildContext);
  if (!context) {
    throw new Error("useChild must be used within a ChildProvider");
  }
  return context;
};
