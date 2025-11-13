import { Component } from  '../pavilion-old.js';

new Component({
  data() {
    return {
      isChecked: true,
      text: 'Hey there!',
      counter: 0,
      counter2: 0,
      static: 'not a number',
      interval: null,
      interval1: null,
      interval2: null,
      some: {
        test: '',
        nested: {
          value: 1,
        },
      },
    };
  },
  // template: '#tpl-app',
  el: '#old-app',
  created() {
    console.log('Created');
  },
  mounted() {
    console.log('Mounted');
    this.startIntervals();
  },
  // updated(key, value, target) {
  //   console.log('Data has been updated!', key, value, target);
  // },
  methods: {
    onBlur() {
      console.log('on blur');
    },
    onInput(event) {
      console.log('on input');
    },
    onButtonClick(event) {
      this.data.counter++;
    },
    computedValue() { return `my cool ${this.data.counter} value!` },
    stopIntervals() {
      [this.data.interval1, this.data.interval2].map(clearInterval);
    },
    startIntervals() {
      this.data.interval1 = window.setInterval(() => {
        this.data.counter++;
      }, this.data.interval);

      this.interval2 = window.setInterval(() => {
        this.data.counter2++;
      });

    },
    resetCounters() {
      this.data.counter = 0;
      this.data.counter2 = 0;
    }
  },
  watch: {
    text(newVal) {
      console.log(`Text has been changed to ${newVal}`);
    },
    'some.nested.value'(newVal) {
      console.log(`Nested value has been changed to ${newVal}`);
    }
  },
})

new Component({
  data() {
    return {
      title: 'I am the hunter, I am the great unknown',
    };
  },
  template: '#tpl-app2',
  el: '#app2',
  created() {
    console.log('App2 Created');
  },
  mounted() {
    console.log('App2 Mounted');
  },
})
