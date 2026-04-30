package com.fitness.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
		"spring.cloud.config.enabled=false",
		"eureka.client.enabled=false",
		"spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:8181/realms/fitness-oauth2/protocol/openid-connect/certs"
})
class GatewayApplicationTests {

	@Test
	void contextLoads() {
	}

}
