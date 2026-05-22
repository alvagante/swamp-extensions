# @alvagante/docker-image-test

Local Docker image smoke testing for swamp. The extension is deliberately not a
general Docker management layer: it focuses on the repeatable test lifecycle for
container images that projects usually need before publishing or deploying.

`testMatrix` accepts one or more image cases. For each case it removes a stale
test container with the same name, builds the image, runs it detached,
optionally polls a health command with `docker exec`, captures inspect/log
output, removes the container, and writes structured resources. The output
includes a matrix `summary` and one `caseResult` per case, so later workflow
steps and reports can reason about failures without scraping terminal logs.

The model is intentionally local-only. Remote execution should be handled by a
swamp execution driver or by a separate target model once there is a concrete
remote use case. Keeping v1 local avoids hiding SSH, Docker context, and host
preparation concerns behind a vague abstraction.

## Usage

```bash
swamp model @alvagante/docker-image-test/runner method run testMatrix docker-image-test \
  --input 'cases=[{"name":"default","contextPath":".","dockerfilePath":"Dockerfile","healthCommand":"node -e \"process.exit(0)\""}]'
```

## Workflow Example

```yaml
steps:
  - name: test-images
    task:
      type: model_method
      modelType: "@alvagante/docker-image-test/runner"
      modelName: docker-image-test
      methodName: testMatrix
      inputs:
        defaultContextPath: .
        imageTagPrefix: myapp
        containerNamePrefix: myapp-test
        cases:
          - name: alpine
            dockerfilePath: Dockerfile.alpine
            imageTag: myapp:test-alpine
            healthCommand: node -e 'process.exit(0)'
```
