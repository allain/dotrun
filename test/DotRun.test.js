const fs = require("fs");
const test = require("tape");

const DotRun = require("../lib/DotRun.js");

test("DotRun - emits event as the program is run", t => {
  let runner = new DotRun(
    `
    digraph testapp	{
      a -> b
      b -> c
    }
  `,
    {
      a: () => {},
      b: () => {}
    }
  );

  let events = [];

  runner.on("started", stateName => {
    events.push({ starting: true });
  });

  runner.on("warning", message => {
    events.push({ warning: message });
  });

  runner.on("performing", stateName => {
    events.push({ performing: stateName });
  });

  runner.on("performed", stateName => {
    events.push({ performed: stateName });
  });

  runner.on("finished", result => {
    t.deepEqual(result, {});

    t.deepEquals(
      events,
      [
        { starting: true },
        { performing: "a" },
        { performed: "a" },
        { performing: "b" },
        { performed: "b" },
        { performing: "c" },
        { warning: "unrecognized action: c" },
        { performed: "c" }
      ],
      "emitted expected events while"
    );
    t.end();
  });

  runner.run().catch(t.error);
});

test("DotRun - supports conditionals by using signals", t => {
  let runner = new DotRun(
    `
    digraph testapp	{
      start -> good [label=foo]
      start -> bad [label=bar]
      good -> end
      bad -> end
    }
  `,
    {
      start: () => "foo"
    }
  );

  let path = [];

  runner.on("performed", path.push.bind(path));

  runner.run().then(() => {
    t.deepEqual(path, ["start", "good", "end"], "path should go through good");
    t.end();
  }, t.fail);
});

test("DotRun - follows first path when multiple outpaths found", t => {
  let runner = new DotRun(
    `
    digraph testapp	{
      start -> good [label=foo]
      start -> bad [label=foo]
      good -> end
      bad -> end
    }
  `,
    {
      start: () => "foo"
    }
  );

  let path = [];

  runner.on("performed", stateName => {
    path.push(stateName);
  });

  runner.run().then(() => {
    t.deepEquals(
      path,
      ["start", "good", "end"],
      "emitted expected events while running"
    );
    t.end();
  }, t.error);
});

test("DotRun - causes error when unrecognized signal is emitted", t => {
  let runner = new DotRun(
    `
    digraph testapp	{
      start -> good [label=foo]
      start -> bad [label=bar]
      good -> end
      bad -> end
    }
  `,
    {
      start: () => "huh"
    }
  );

  let errorEvent;
  runner.on("error", err => {
    errorEvent = err;
    t.deepEqual(errorEvent, {
      state: "start",
      signal: "huh",
      error: 'No next states possible from "start" for "huh"'
    });
  });

  runner.run().then(
    () => {
      t.fail("should have rejected");
    },
    err => {
      t.ok(!!errorEvent, "error event not emitted");
      t.ok(err instanceof Error);
      t.equal(err.message, 'No next states possible from "start" for "huh"');
      t.end();
    }
  );
});

test("DotRun - causes error when no signal is emitted but one is expected", t => {
  let runner = new DotRun(
    `
    digraph testapp	{
      start -> good [label=foo]
      start -> bad [label=bar]
      good -> end
      bad -> end
    }
  `,
    {}
  );

  let errorEvent;
  runner.on("error", err => {
    errorEvent = err;
    t.deepEqual(errorEvent, {
      state: "start",
      signal: "",
      error: 'No next states possible from "start"'
    });
  });

  runner.run().then(
    () => {
      t.fail("should have rejected");
    },
    err => {
      t.ok(!!errorEvent, "error event not emitted");
      t.ok(err instanceof Error);
      t.equal(err.message, 'No next states possible from "start"');
      t.end();
    }
  );
});

test("DotRun - supports two state graphs", t => {
  let actioned = [];

  let runner = new DotRun(
    `
    digraph testapp	{
      start -> end
    }
  `,
    {
      start: () => {
        actioned.push("start");
      },
      end: () => {
        actioned.push("end");
      }
    }
  );

  let path = [];
  runner.on("performed", path.push.bind(path));

  runner.run().then(() => {
    t.deepEqual(path, ["start", "end"]);
    t.deepEqual(actioned, ["start", "end"]);
    t.end();
  }, t.error);
});

test("DotRun - shared contex is passed into each action", t => {
  let contexts = [];

  let runner = new DotRun(
    `
    digraph testapp	{
      start -> middle
      middle -> end
    }
  `,
    {
      start: (params, context) => {
        contexts.push(context);
      },
      middle: (params, context) => {
        contexts.push(context);
      },
      end: (params, context) => {
        contexts.push(context);
      }
    }
  );

  runner.run().then(() => {
    t.equal(contexts.length, 3);
    t.equal(contexts[0], contexts[1]);
    t.equal(contexts[1], contexts[2]);
    t.end();
  }, t.error);
});

test("DotRun - actions can be dynamically matched", t => {
  let said = [];

  let runner = new DotRun(
    `
    digraph testapp	{
      start -> "Say Hello"
      "Say Hello" -> end
    }
  `,
    {
      "Say {message}": ({ message }) => {
        said.push(message);
      }
    }
  );

  runner.run().then(() => {
    t.deepEqual(said, ["Hello"]);
    t.end();
  }, t.error);
});

test("DotRun - actions may return a Promise", t => {
  let promiseRan = false;
  let runner = new DotRun(
    `digraph test {
    start -> a
    a -> end
  }`,
    {
      a: () =>
        new Promise(resolve => {
          promiseRan = true;
          setTimeout(() => {
            resolve();
          }, 5);
        })
    }
  );

  let start = Date.now();
  runner.run().then(() => {
    t.ok(promiseRan, "promise should run");
    t.ok(
      Date.now() - start > 4,
      "should take more than 4ms for test to run, otherwise runner did not wait for promise to resolve."
    );
    t.end();
  }, t.error);
});

test("DotRun - actions may return a rejecting Promise", t => {
  let promiseRan = false;
  let runner = new DotRun(
    `digraph test {
    start -> a
    a -> end
  }`,
    {
      a: () => Promise.reject(new Error("the sky is falling"))
    }
  );

  let errorEvents = [];
  runner.on("error", err => {
    errorEvents.push(err);
  });

  runner
    .run()
    .then(() => t.fail("failing action did not fail run "))
    .catch(err => {
      t.equal(errorEvents.length, 1, "only 1 error event is emitted");
      t.equal(
        errorEvents[0].message,
        "the sky is falling",
        "correct error event mesage"
      );
      t.equal(err.message, "the sky is falling", "correct error message");
      t.end();
    });
});
