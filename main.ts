// Copyright (c) HashiCorp, Inc
// SPDX-License-Identifier: MPL-2.0
import { Construct, IConstruct } from "constructs";
import { App, Aspects, TerraformOutput, TerraformStack } from "cdktf";

abstract class AsyncConstruct<T> extends Construct {
  private data?: T;

  constructor(scope: IConstruct, id: string) {
    super(scope, id);
    Aspects.of(this).add({
      visit: (node) => {
        if (node === this) {
          // only run for ourselves, not on childs (Aspects are invoked on any children)
          this.onFetched(this.data!);
        }
      },
    });
  }
  abstract onFetched(data: T): void;
  abstract onFetch(): Promise<T>;
  public async runFetch(): Promise<void> {
    this.data = await this.onFetch();
  }
}

async function prepareAsyncConstructs(app: App) {
  const asyncConstructs = app.node
    .findAll()
    .filter<AsyncConstruct<any>>(
      (c): c is AsyncConstruct<any> => c instanceof AsyncConstruct
    );
  return Promise.all(asyncConstructs.map((c) => c.runFetch()));
}

// Construct that has an (fake) async method downloading data
// and a synchronous method that is invoked later after the data is available
class MyConstruct extends AsyncConstruct<string[]> {
  constructor(scope: IConstruct, id: string) {
    super(scope, id);
    
    new TerraformOutput(this, "other-output", { value: "this one doesn't require async data"});
  }

  public async onFetch(): Promise<string[]> {
    console.log("Simulating data fetching via timeout..");
    await new Promise((r) => setTimeout(r, 5000));
    console.log("Data fetched");
    return ["fake", "data", "fetched", "via", "api"];
  }

  onFetched(data: string[]) {
    data.forEach((item) => {
      new TerraformOutput(this, `output-${item}`, { value: item });
    });
  }
}

class MyStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new MyConstruct(this, "my-async");

  }
}

(async function main() {
  const app = new App();
  new MyStack(app, "prototype-cdktf-async-constructs");
  // required before synth to run async stuff
  await prepareAsyncConstructs(app);
  // synthesis will invoke Aspects, which will add the resources (in this example TerraformOutputs)
  app.synth();
})();
