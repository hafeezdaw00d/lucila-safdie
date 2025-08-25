if (!customElements.get('price-per-item')) {
  customElements.define(
    'price-per-item',
    class PricePerItem extends HTMLElement {
      constructor() {
        super();
        this.variantId = this.dataset.variantId;
        this.compareAtCents = parseInt(this.dataset.compareAt || '0', 10);

        // quantity input on product page
        this.input = document.getElementById(
          `Quantity-${this.dataset.sectionId || this.dataset.variantId}`
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
            // keep compare-at fresh for the new variant
            this.dataset.compareAt = event.data.variant.compare_at_price || 0;
            this.compareAtCents = parseInt(this.dataset.compareAt || '0', 10);
            this.getVolumePricingArray();
            this.updatePricePerItem();
          }
        );

        // react to cart updates
        this.updatePricePerItemUnsubscriber = subscribe(
          PUB_SUB_EVENTS.cartUpdate,
          (response) => {
            if (!response.cartData) return;

            // Item added from product page
            if (response.cartData['variant_id'] !== undefined) {
              if (response.productVariantId === this.variantId) {
                this.updatePricePerItem(response.cartData.quantity);
              }
            } else if (response.cartData.item_count !== 0) {
              // Qty updated in cart
              const isVariant = response.cartData.items.find(
                (item) => item.variant_id.toString() === this.variantId
              );
              if (isVariant && isVariant.id.toString() === this.variantId) {
                this.updatePricePerItem(isVariant.quantity);
              } else {
                this.updatePricePerItem(0);
              }
            } else {
              // All removed
              this.updatePricePerItem(0);
            }
          }
        );

        // render once on load
        this.updatePricePerItem();
      }

      disconnectedCallback() {
        if (this.updatePricePerItemUnsubscriber) this.updatePricePerItemUnsubscriber();
        if (this.variantIdChangedUnsubscriber) this.variantIdChangedUnsubscriber();
      }

      onInputChange() {
        this.updatePricePerItem();
      }

      getCartQuantity(updatedCartQuantity) {
        return (updatedCartQuantity || updatedCartQuantity === 0)
          ? updatedCartQuantity
          : parseInt(this.input?.dataset.cartQuantity || '0', 10);
      }

      getVolumePricingArray() {
        const volumePricing = document.getElementById(
          `Volume-${this.dataset.sectionId || this.dataset.variantId}`
        );
        this.qtyPricePairs = [];

        if (volumePricing) {
          volumePricing.querySelectorAll('li').forEach((li) => {
            const qty = parseInt(li.querySelector('span:first-child')?.textContent || '0', 10);
            const priceSpan = li.querySelector('span:not(:first-child):last-child');
            if (!priceSpan) return;
            const text = priceSpan.dataset.text || '';
            const cents = parseInt(priceSpan.dataset.cents || '0', 10);
            this.qtyPricePairs.push([qty, text, cents]);
          });
          // sort desc by qty threshold so we can pick the first match
          this.qtyPricePairs.sort((a, b) => b[0] - a[0]);
        }
      }

      updatePricePerItem(updatedCartQuantity) {
        // read qty inputs safely
        if (this.input) {
          this.enteredQty = parseInt(this.input.value || '0', 10);
          this.step = parseInt(this.input.step || '1', 10);
        }

        // when updatedCartQuantity is undefined we are on product page
        this.currentQtyForVolumePricing =
          updatedCartQuantity === undefined
            ? this.getCartQuantity(updatedCartQuantity) + (this.enteredQty || 0)
            : this.getCartQuantity(updatedCartQuantity) + (this.step || 1);

        // quick order list uses raw cart qty
        if (this.classList.contains('variant-item__price-per-item')) {
          this.currentQtyForVolumePricing = this.getCartQuantity(updatedCartQuantity);
        }

        // choose matching tier: [qty, localizedText, cents]
        let unitText = '';
        let unitCents = 0;
        for (let pair of this.qtyPricePairs) {
          if (this.currentQtyForVolumePricing >= pair[0]) {
            unitText = pair[1] || '';
            unitCents = pair[2] || 0;
            break;
          }
        }
        // fallback to whatever is already there
        if (!unitText) {
          const existing = this.querySelector('.price-per-item--current');
          unitText = existing ? existing.innerHTML : '';
        }

        // target container inside this element
        const container =
          this.querySelector('.price-per-item') || this;

        if (!container) return;

        // quick order list special "each" string
        const eachText =
          this.classList.contains('variant-item__price-per-item') &&
          window.quickOrderListStrings?.each
            ? window.quickOrderListStrings.each.replace(
                '[money]',
                unitText.replace(/.*?(?:€|\$|£)/, (m) => m) // simple keep existing money text
              )
            : unitText;

        const compareAt = this.compareAtCents || 0;
        const isSale = compareAt && unitCents && compareAt > unitCents;

        if (isSale) {
          const reg = Shopify.formatMoney(compareAt);
          container.innerHTML = `
            <dl class="price-per-item--current">
              <dt class="visually-hidden">${window.accessibilityStrings?.regularPrice || 'Regular price'}</dt>
              <dd><s class="variant-item__old-price">${reg}</s></dd>
              <dt class="visually-hidden">${window.accessibilityStrings?.salePrice || 'Sale price'}</dt>
              <dd><span class="price-per-item--current">${eachText}</span></dd>
            </dl>
          `;
        } else if (compareAt && !unitCents) {
          // if we do not know unit cents but a compare at value exists, still show strike
          const reg = Shopify.formatMoney(compareAt);
          container.innerHTML = `
            <dl class="price-per-item--current">
              <dt class="visually-hidden">${window.accessibilityStrings?.regularPrice || 'Regular price'}</dt>
              <dd><s class="variant-item__old-price">${reg}</s></dd>
              <dt class="visually-hidden">${window.accessibilityStrings?.salePrice || 'Sale price'}</dt>
              <dd><span class="price-per-item--current">${eachText}</span></dd>
            </dl>
          `;
        } else {
          container.innerHTML = `<span class="price-per-item--current">${eachText}</span>`;
        }
      }
    }
  );
}
