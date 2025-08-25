if (!customElements.get('price-per-item')) {
  customElements.define(
    'price-per-item',
    class PricePerItem extends HTMLElement {
      constructor() {
        super();
        this.variantId = this.dataset.variantId;
        this.compareAtCents = parseInt(this.dataset.compareAt || '0', 10);

        this.input = document.getElementById(
          `Quantity-${this.dataset.sectionId || this.dataset.variantId}`,
        );
        if (this.input) {
          this.input.addEventListener('change', this.onInputChange.bind(this));
        }

        this.getVolumePricingArray();
      }

      updatePricePerItemUnsubscriber = undefined;
      variantIdChangedUnsubscriber = undefined;

      connectedCallback() {
        // react to variant changes
        this.variantIdChangedUnsubscriber = subscribe(
          PUB_SUB_EVENTS.variantChange,
          (event) => {
            this.variantId = event.data.variant.id.toString();
            // keep compare-at up to date for the new variant
            this.dataset.compareAt = event.data.variant.compare_at_price || 0;
            this.compareAtCents = parseInt(this.dataset.compareAt || '0', 10);

            this.getVolumePricingArray();
            this.updatePricePerItem(); // refresh view
          },
        );

        // react to cart updates
        this.updatePricePerItemUnsubscriber = subscribe(
          PUB_SUB_EVENTS.cartUpdate,
          (response) => {
            if (!response.cartData) return;

            if (response.cartData['variant_id'] !== undefined) {
              // item was added from product page
              if (response.productVariantId === this.variantId) {
                this.updatePricePerItem(response.cartData.quantity);
              }
            } else if (response.cartData.item_count !== 0) {
              // qty updated in cart
              const isVariant = response.cartData.items.find(
                (item) => item.variant_id.toString() === this.variantId,
              );
              if (isVariant && isVariant.id.toString() === this.variantId) {
                this.updatePricePerItem(isVariant.quantity);
              } else {
                this.updatePricePerItem(0);
              }
            } else {
              // all items removed
              this.updatePricePerItem(0);
            }
          },
        );
      }

      disconnectedCallback() {
        if (this.updatePricePerItemUnsubscriber) this.updatePricePerItemUnsubscriber();
        if (this.variantIdChangedUnsubscriber) this.variantIdChangedUnsubscriber();
      }

      onInputChange() {
        this.updatePricePerItem();
      }

      updatePricePerItem(updatedCartQuantity) {
        if (this.input) {
          this.enteredQty = parseInt(this.input.value || '0', 10);
          this.step = parseInt(this.input.step || '1', 10);
        }

        // updatedCartQuantity undefined when changed on product page
        this.currentQtyForVolumePricing =
          updatedCartQuantity === undefined
            ? this.getCartQuantity(updatedCartQuantity) + (this.enteredQty || 0)
            : this.getCartQuantity(updatedCartQuantity) + (this.step || 1);

        if (this.classList.contains('variant-item__price-per-item')) {
          // quick order list uses raw cart qty
          this.currentQtyForVolumePricing = this.getCartQuantity(updatedCartQuantity);
        }

        // choose the right tier [qty, text, cents]
        let unitText = null;
        let unitCents = 0;
        for (let pair of this.qtyPricePairs) {
          if (this.currentQtyForVolumePricing >= pair[0]) {
            unitText = pair[1];
            unitCents = pair[2] || 0;
            break;
          }
        }
        if (unitText === null) return; // nothing to render

        // target container inside this element
        const container = document.querySelector(
          `price-per-item[id^="Price-Per-Item-${this.dataset.sectionId || this.dataset.variantId}"] .price-per-item`
        ) || this.querySelector('.price-per-item');
        if (!container) return;

        const fmt = (cents) => Shopify.formatMoney(cents);
        const sale = this.compareAtCents && unitCents && this.compareAtCents > unitCents;

        // Quick Order List uses a different string
        const eachText = this.classList.contains('variant-item__price-per-item')
          ? (window.quickOrderListStrings?.each
              ? window.quickOrderListStrings.each.replace('[money]', fmt(unitCents))
              : unitText)
          : unitText;

        if (sale) {
          const reg = fmt(this.compareAtCents);
          container.innerHTML = `
            <dl class="price-per-item--current">
              <dt class="visually-hidden">${window.accessibilityStrings?.regularPrice || 'Regular price'}</dt>
              <dd><s class="variant-item__old-price">${reg}</s></dd>
              <dt class="visually-hidden">${window.accessibilityStrings?.salePrice || 'Sale price'}</dt>
              <dd><span class="price-per-item--current">${eachText}</span></dd>
            </dl>`;
        } else {
          container.innerHTML = `<span class="price-per-item--current">${eachText}</span>`;
        }
      }

      getCartQuantity(updatedCartQuantity) {
        return (updatedCartQuantity || updatedCartQuantity === 0)
          ? updatedCartQuantity
          : parseInt(this.input?.dataset.cartQuantity || '0', 10);
      }

      getVolumePricingArray() {
        const volumePricing = document.getElementById(
          `Volume-${this.dataset.sectionId || this.dataset.variantId}`,
        );
        this.qtyPricePairs = [];

        if (volumePricing) {
          volumePricing.querySelectorAll('li').forEach((li) => {
            const qty = parseInt(li.querySelector('span:first-child')?.textContent || '0', 10);
            const priceSpan = li.querySelector('span:not(:first-child):last-child');
            if (!priceSpan) return;
            const text = priceSpan.dataset.text;
            const cents = parseInt(priceSpan.dataset.cents || '0', 10);
            this.qtyPricePairs.push([qty, text, cents]);
          });
          this.qtyPricePairs.reverse();
        }
      }
    },
  );
}
updatePricePerItem(updatedCartQuantity) {
  // read inputs safely
  if (this.input) {
    this.enteredQty = parseInt(this.input.value || '0', 10);
    this.step = parseInt(this.input.step || '1', 10);
  }

  // cart qty logic (unchanged)
  this.currentQtyForVolumePricing =
    updatedCartQuantity === undefined
      ? this.getCartQuantity(updatedCartQuantity) + (this.enteredQty || 0)
      : this.getCartQuantity(updatedCartQuantity) + (this.step || 1);

  if (this.classList.contains('variant-item__price-per-item')) {
    this.currentQtyForVolumePricing = this.getCartQuantity(updatedCartQuantity);
  }

  // pick the right tier text; we keep using your existing list text
  let unitText = null;
  for (let pair of this.qtyPricePairs) {
    if (this.currentQtyForVolumePricing >= pair[0]) {
      unitText = pair[1]; // already localized "price at each …"
      break;
    }
  }

  // Fallbacks: if there were no pairs, reuse whatever is already on the page
  if (unitText === null) {
    const existing = this.querySelector('.price-per-item--current');
    unitText = existing ? existing.innerHTML : '';
  }

  // target the container INSIDE this element (not document-wide)
  const container = this.querySelector('.price-per-item') || this;
  if (!container) return;

  // read compare-at cents from data attribute; if missing, try to infer from current DOM
  let compareAtCents = parseInt(this.dataset.compareAt || '0', 10);
  if (!compareAtCents) {
    // if Liquid rendered an <s> initially, honor it even without cents
    const hadStrike = this.querySelector('s.variant-item__old-price');
    if (hadStrike) compareAtCents = 1; // sentinel: "show strike"
  }

  // Quick Order List has a special "each" string; keep your behavior
  const eachText = this.classList.contains('variant-item__price-per-item') && window.quickOrderListStrings?.each
    ? window.quickOrderListStrings.each.replace('[money]', (unitText.match(/(?:€|\$|£).+/) || [unitText])[0])
    : unitText;

  // If we have ANY compare-at value, show old + new in the same <dl>
  if (compareAtCents > 0) {
    // If we actually know the money string for compare-at, try to format it;
    // otherwise reuse whatever Liquid may have rendered (keeps currency/locale right)
    const existingOld = this.querySelector('s.variant-item__old-price');
    const oldPriceHTML = existingOld ? existingOld.innerHTML : ''; // empty is ok

    container.innerHTML = `
      <dl class="price-per-item--current">
        <dt class="visually-hidden">${window.accessibilityStrings?.regularPrice || 'Regular price'}</dt>
        <dd><s class="variant-item__old-price">${oldPriceHTML}</s></dd>
        <dt class="visually-hidden">${window.accessibilityStrings?.salePrice || 'Sale price'}</dt>
        <dd><span class="price-per-item--current">${eachText}</span></dd>
      </dl>
    `;
  } else {
    container.innerHTML = `<span class="price-per-item--current">${eachText}</span>`;
  }
}
