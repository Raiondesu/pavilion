import { createComponent, reactive, set, watch } from '../pavilion';

createComponent(render => {
  const isChecked = reactive(true);
  const text = reactive('Hey there!');
  const counter = reactive(0);
  const counter2 = reactive(0);
  const nan = 'not a number';
  const interval = reactive(1000);
  const some = reactive({
    test: '',
    nested: {
      value: 1,
    },
  });

  let interval1: number;
  let interval2: number;

  const stopIntervals = () => [interval1, interval2].map(clearInterval);
  const startIntervals = () => {
    watch(() => {
      interval1 = window.setInterval(() => {
        set(counter, old => old + 1);
      }, interval());

      interval2 = window.setInterval(() => {
        set(counter2, old => old + 1);
      });

      return stopIntervals;
    });
  };

  startIntervals();

  setInterval(() => {
    console.log('New interval:', set(interval, Math.random() * 10_000));
  }, 10_000);

  const computedValue = () => `my cool ${counter()} value!`;

  watch(() => {
    console.log('Data has been updated:', {
      isChecked: isChecked(),
      text: text(),
      counter: counter(),
      interval: interval(),
      some: some(),
      computedValue: computedValue()
    });
  });

  console.log('BeforeCreated');

  const mount = render({
    isChecked,
    text,
    counter,
    counter2,
    nan,
    interval,
    some,
    computedValue,
    all: () => counter() + counter2(),
    startIntervals,
    stopIntervals,

    onBlur() {
      console.log('on blur');
    },
    onInput() {
      console.log('on input');
    },
    onButtonClick() {
      set(counter, old => old + 1);
    },
    resetCounters() {
      counter.reset();
      counter2.reset();
    }
  });

  console.log('Created');

  return element => {
    console.log('Mounted', element);
    return mount(element);
  };
}).then(c => c.mount('#app'));
